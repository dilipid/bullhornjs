'use strict';

class Cache {
	static put(key, value) {
		localStorage.setItem(key, JSON.stringify(value));
		return value;
	}

    static get(key){
		let value = localStorage.getItem(key);
		if(value){
			return JSON.parse(value);
		}
		return null;
	}

    static has(key){
		let value = localStorage.getItem(key);
		if(value){
			return JSON.parse(value);
		}
		return false;
	}
}

/**
 * A Promise that uses the deferred antipattern
 * @class
 * @memberof Utils
 */
function Deferred() {
    const temp = {};
    const promise = new Promise((resolve, reject) => {
        temp.resolve = resolve;
        temp.reject = reject;
    });
    promise.resolve = temp.resolve;
    promise.reject = temp.reject;
    return promise;
}

function XHR() {
    if( window.XMLHttpRequest ) {
        return window.XMLHttpRequest;
    }
	try {
		return new ActiveXObject("Msxml2.XMLHTTP.6.0");
	} catch(e1) {}
	try {
		return new ActiveXObject("Msxml2.XMLHTTP.3.0");
	} catch(e2) {}
	try {
		return new ActiveXObject("Msxml2.XMLHTTP");
	} catch(e3) {}
	throw new Error("This browser does not support XMLHttpRequest.");
};

/**
* A utility class to manage Query String paramaters, handles encoding and arrays
* @class
* @param {string} url - url to append parameters to
* @param {Object} params - parameter to append to url
*/
class QueryString {
    constructor(url, params) {
        this.url = url;
        this.parts = [];
        if (params) {
            for( var key in params){
                var value = params[key];
                if (value instanceof Array) {
                    this.parts.push(key + '=' + encodeURIComponent(value.join(',')));
                } else {
                    this.parts.push(key + '=' + encodeURIComponent(value));
                }
            }
        }
    }

	static destruct(location) {
		var url = location.protocol + '//' + location.host + location.pathname,
			params = {};
		location.search.replace(new RegExp('([^?=&]+)(=([^&]*))?', 'g'), function ($0, $1, $2, $3) {
			params[decodeURIComponent($1)] = decodeURIComponent($3);
		});

		return { url, params };
	}
    /**
    * Convert to string
    * @returns {string}
    */
    toString() {
        return this.url + ((this.url.indexOf('?') === -1) ? '?' : '&') + this.parts.join('&');
    }
}

const HEADERS = {
    COMMON: {
        'Accept': 'application/json, text/plain, */*'
    },
    POST: {
        'Content-Type': 'application/json;charset=utf-8'
    },
    PUT: {
        'Content-Type': 'application/json;charset=utf-8'
    }
};

let callbacks = {
	counter: 0
};

let XMLRequest = XHR();

class HttpService {

    constructor(host, globals) {
		this.host = host;
		this.globals = globals || {};
	}

	_execute(method, path, parameters = {}, data, headers, responseType) {
		let http = new XMLRequest(),
			deferred = new Deferred(),
			url = (path.indexOf('//') > -1) ? path : this.host + path;

		for(let key in this.globals) {
			parameters[key] = this.globals[key];
		}

        let endpoint = new QueryString(url, parameters).toString();
		http.open(method, endpoint, true);
		if ( headers ) {
            for ( let header in headers ) {
                http.setRequestHeader(header, headers[header]);
            }
		}

		http.onreadystatechange = function() {
			if(http.readyState == 4) {
				if(http.status == 200) {
					deferred.resolve(JSON.parse(http.response || http.responseText));
				} else {
					deferred.reject(JSON.parse(http.response || http.responseText));
				}
			}
		}
		if(responseType) http.responseType = responseType;

		http.send(JSON.stringify(data));

		return deferred;
	}

	get(path, parameters) {
		return this._execute("GET", path, parameters || {}, null, HEADERS.COMMON);
	}

	post(path, data, parameters) {
		return this._execute("POST", path, parameters, data, HEADERS.POST);
	}

	put(path, data, parameters) {
		return this._execute("PUT", path, parameters, data, HEADERS.PUT);
	}

	remove(path, parameters) {
		return this._execute("DELETE", path, parameters, null, HEADERS.COMMON);
	}

	jsonp(path, parameters = {}, data) {
		let script = window.document.createElement('script'),
			deferred = new Deferred(),
			url = (path.indexOf('//') > -1) ? path : this.host + path,
			cbid = callback();

		for (let key in this.globals) {
			parameters[key] = this.globals[key];
		}
		parameters.callback = 'callbacks.' + cbid;
		callbacks[cbid] = function(data) {
			window.document.body.removeChild(script);
			if (data) {
				deferred.resolve(data);
			} else {
				deferred.reject();
			}
			delete callbacks[cbid];
			for (let prop in script) {
				delete script[prop];
			}
		};

		script.type = 'text/javascript';
		script.src = new QueryString(url, parameters).toString();
		script.onerror = function() {
			callbacks[cbid](null);
		};

		window.document.body.appendChild(script);
		return deferred;
	}
}

class Query {
	constructor(endpoint) {
        this.endpoint = endpoint;
        this.records = [];
        this._page = 0;
        this.WHERE = 'where';
        this.ORDER = 'orderBy';
        this.parameters = {
			fields: ['id'],
			start: 0,
			count: 10
		};
	}

	fields(...args) {
		this.parameters.fields = args[0] instanceof Array ? args[0] : args;
		return this;
	}

	sort(...args) {
		this.parameters[this.ORDER] = args[0] instanceof Array ? args[0] : args;
		return this;
	}

	query(value) {
		this.parameters[this.WHERE] = value;
		return this;
	}

	count(value) {
		this.parameters.count = value;
		return this;
	}

	page(value) {
		this._page = value;
		this.parameters.start = this.parameters.count * value;
		return this;
	}

	nextpage() {
		this.page(++this._page);
		return this.run(true);
	}

	params(object) {
		this.parameters = Object.assign(this.parameters, object);
		return this;
	}

    get(add) {
        return this.run(add);
    }

	run(add) {
    	let interceptor = new Deferred();
        let request;
		//BH-15325: Akamai has a query string limit.
		let too_long = new QueryString('', this.parameters).toString().length > 8000;
		if ( too_long ) {
			request = Bullhorn.http().post(this.endpoint, this.parameters)
		} else {
			request = Bullhorn.http().get(this.endpoint, this.parameters)
        }

        request
            .then( (response) => {
    			if(add) this.records = this.records.concat(response.data);
    			else this.records = response.data;
    			interceptor.resolve(response);
    		})
            .catch( (message) => {
    			interceptor.reject(message);
    		});

		return interceptor;
	}

}

class Search extends Query {
	constructor(endpoint) {
		super(endpoint);
        this.WHERE = 'query';
        this.ORDER = 'sort';
		this.parameters = {
			fields: ['id'],
			sort: ['-dateAdded'],
			start: 0,
			count: 10
		};
	}
}

function clean$1(name) {
	var cleaned = name.split('.')[0];
	cleaned = cleaned.split('[')[0];
	cleaned = cleaned.split('(')[0];
	return cleaned;
}

class Entity {
	constructor(endpoint) {
		this.endpoint = endpoint;
		this.data = {};
		this.parameters = {
			fields: ['id']
		};
	}

    fields(...args) {
        this.parameters.fields = args[0] instanceof Array ? args[0] : args;
		for(let f of this.parameters.fields) {
			let field = clean$1(f);
			(function(obj, field) {
				if(!obj.data.hasOwnProperty(field)) {
					Object.defineProperty(obj, field, {
						get: function() {
							return obj.data[field];
						},
						set: function(value) {
							obj.data[field] = value;
						},
						configurable: true,
						enumerable: true
					});
				}
			})(this, field);
		}
		return this;
	}

	params(object) {
		this.parameters = Object.assign(this.parameters, object);
		return this;
	}

	get(id) {
		let	interceptor = new Deferred();
		this.data.id = id;
		Bullhorn.http()
            .get(this.endpoint + id, this.parameters)
            .then((response) => {
    			this.data = Object.assign(this.data, response.data);
    			interceptor.resolve(response);
    		}).catch( (message) => {
    			interceptor.reject(message);
    		});

		return interceptor;
	}

	many(property, fields, params) {
		var me = this,
			interceptor = new Deferred(),
            merged = Object.assign({
    			fields: fields,
    			showTotalMatched: true
    		}, params);

        Bullhorn.http().get(this.endpoint + me.data.id + '/' + property, merged)
            .then((response) => {
                (function(obj, field) {
    				if(!obj.data.hasOwnProperty(field)) {
    					Object.defineProperty(obj, field, {
    						get: function() {
    							return obj.data[field];
    						},
    						set: function(value) {
    							obj.data[field] = value;
    						},
    						configurable: true,
    						enumerable: true
    					});
    				}
    			})(this, property);
    			this.data[property] = response;
    			interceptor.resolve(response);
    		}).catch( (message) => {
    			interceptor.reject(message);
    		});

		return interceptor;
	}

	save() {
		// Update
		if(this.data.id) return Bullhorn.http().post(this.endpoint + this.data.id, this.data);
		// Create
		return Bullhorn.http().put(this.endpoint, this.data);
	}

	remove() {
		return Bullhorn.http().remove(this.endpoint + this.data.id, null);
	}

}

function CreateSearch(name, entity) {
    window[name] = function() {
        return new Search('search/' + entity);
    }
}

function CreateQuery(name, entity) {
    window[name] = function() {
        return new Query('query/' + entity);
    }
}

function CreateEntity(name, entity) {
    window[name] = function() {
        return new Entity('entity/' + entity + '/');
    }
}

function CreateMeta(name, entity) {
    window[name] = function(parser) {
        let m = new Meta('meta/' + entity, parser);
        m.entity = entity;
        return m;
    }
}

class Bullhorn {

    constructor(config) {
        this.apiVersion = config.apiVersion || '*';
        if(config.BhRestToken && config.restUrl){
            Cache.put('BhRestToken', config.BhRestToken);
            Cache.put('restUrl', config.restUrl);
        }
    }

	login(token) {
		//Step 3 - Login
		let http = new HttpService(this.loginUrl);
		http.get('/login', {
			access_token: token,
			version: this.apiVersion
		}).then(function (session) {
			Cache.put('BhRestToken', session.BhRestToken);
			Cache.put('restUrl', session.restUrl);
			this.isLoggedIn();
		}.bind(this));
	}

	isLoggedIn(){
		return this.ping();
	}
	/**
	 * Retrieves the HttpService created to connect to the Bullhorn RestApi
	 * @name http
	 * @memberof Application#
	 * @static
	 * @return {HttpService}
	 */
	static http() {
		let BhRestToken = Cache.get('BhRestToken'),
			endpoint = Cache.get('restUrl');

		if(BhRestToken && endpoint){
			return new HttpService(endpoint, { BhRestToken });
		}

		//throw new Error('You must authenticate first before using this service');
        return new HttpService();
	}

	ping() {
		return new Promise((resolve, reject) => {
            let token = Cache.get('BhRestToken'),
                endpoint = Cache.get('restUrl');

            if (token && endpoint) {
                let http = new HttpService(endpoint, { BhRestToken: token });
                http.get('ping', {})
                    .then( (pong) => {
                        //Authentication Success
                        resolve(pong);
                     })
                    .catch( (err) => {
                        //Authentication Failure
                        //window.location = authAddress;
                        reject('Auth Failure', err);
                     });
            } else {
                reject('Auth Failure', 'No BhRestToken is defined');
            }
        });
	}

    static initDefaults(){
		//Setup Defaults
		CreateMeta('CandidateMeta', 'Candidate');
		CreateMeta('JobMeta', 'JobOrder');
		CreateMeta('ContactMeta', 'ClientContact');
		CreateMeta('CompanyMeta', 'ClientCorporation');
		CreateMeta('JobSearch', 'JobOrder');
		CreateMeta('PlacementMeta', 'Placement');
		CreateMeta('SubmissionMeta', 'JobSubmission');
		CreateMeta('TearsheetMeta', 'Tearsheet');
		CreateMeta('TaskMeta', 'Task');
		CreateMeta('PersonMeta', 'Person');
		CreateMeta('UserMeta', 'CorporateUser');
		CreateMeta('LeadMeta', 'Lead');
		CreateMeta('OpportunityMeta', 'Opportunity');

		CreateSearch('CandidateSearch', 'Candidate');
		CreateSearch('ContactSearch', 'ClientContact');
		CreateSearch('CompanySearch', 'ClientCorporation');
		CreateSearch('JobSearch', 'JobOrder');
		CreateSearch('PlacementSearch', 'Placement');
		CreateSearch('SubmissionSearch', 'JobSubmission');
		CreateSearch('TaskSearch', 'Task');
		CreateSearch('LeadSearch', 'Lead');
		CreateSearch('OpportunitySearch', 'Opportunity');
		CreateSearch('Notes', 'Note');

		CreateQuery('Departments', 'CorporationDepartment');
		CreateQuery('Users', 'CorporateUser');
		CreateQuery('People', 'Person');
		CreateQuery('SubmissionHistories', 'JobSubmissionHistory');
		CreateQuery('Tearsheets', 'Tearsheet');
		CreateQuery('DistributionList', 'DistributionList');
		CreateQuery('Tasks', 'Task');

		CreateEntity('Candidate', 'Candidate');
		CreateEntity('Contact', 'ClientContact');
		CreateEntity('User', 'CorporateUser');
		CreateEntity('Person', 'Person');
		CreateEntity('Company', 'ClientCorporation');
		CreateEntity('Job', 'JobOrder');
		CreateEntity('Placement', 'Placement');
		CreateEntity('Submission', 'JobSubmission');
		CreateEntity('Tearsheet', 'Tearsheet');
		CreateEntity('Task', 'Task');
		CreateEntity('Note', 'Note');
		CreateEntity('Lead', 'Lead');
		CreateEntity('Opportunity', 'Opportunity');
    }

}

function toFieldNotation(str) {
    let strarr = str.split('.'),
        len = strarr.length;

    let result = strarr.join('(');
    for(let i=1; i < len; i++){
        result += ')';
    }
    return result;
}

function EnsureUnique(arr) {
    let a = arr.concat();
    for(let i = 0; i < a.length; ++i) {
        for(let j = i + 1; j < a.length; ++j) {
            if(a[i] === a[j]) a.splice(j, 1);
        }
    }
    return a;
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

class Meta {
    constructor(endpoint, parser){
        this.endpoint = endpoint;
        this.all = [];
        this.cache = {};
        this.parser = parser;
        this.parameters = {
            fields: '*',
            meta: 'full'
        };
    }

    defaultMetaParser(data) {
		let list = [],
			interceptor = new Deferred();

		setTimeout( () => {
            for ( let item of data ) {
				if(item.name == 'id') item.readOnly = true;
				if(item.name == 'address') item.readOnly = false;
				if(item.name == 'dateAdded') item.readOnly = true;
				if(item.name == 'timeUnits') item.readOnly = true;
				if(!item.label) item.label = capitalizeFirstLetter(item.name);

				item.sortable = ['COMPOSITE', 'TO_MANY', 'TO_ONE'].indexOf(item.type.toUpperCase()) == -1;
				item.searchField = item.name;

				if(['TO_MANY', 'TO_ONE'].indexOf(item.type.toUpperCase()) > -1 && !item.optionsUrl){
					item.optionsUrl = Bullhorn.http().host + 'options/' + item.associatedEntity.entity;
				}

				if(item.optionsUrl && item.options) {
					delete item.options;
				}
				if((['SELECT', 'CHECKBOX', 'RADIO'].indexOf(item.inputType) > -1) && !(item.options || item.optionsUrl)) {
					item.options = (item.dataType == 'Boolean') ? [{
						label: "True",
						value: true
					}, {
						label: "False",
						value: false
					}] : [{
						label: "True",
						value: 1
					}, {
						label: "False",
						value: 0
					}];
				}
				if(['isDeleted'].indexOf(item.name) < 0) list.push(item);
			}
			interceptor.resolve(list);
		},10);

		return interceptor;
	}

    fields(...args) {
		this.parameters.fields = args[0] instanceof Array ? args[0] : args;
		return this;
	}

	type(value) {
		this.parameters.meta = value;
		return this;
	}

	params(object) {
		this.parameters = Object.merge(this.parameters, object);
		return this;
	}

	field(name){
		var interceptor = new Deferred(),
			result = this.lookup(name, this.cache);

		if( !result ) {
			let f = toFieldNotation(name);
			Bullhorn.http()
                .get(this.endpoint, {fields: f, meta:'full'})
                .then( (response) => {
					let obj = {},
						names = name.split('.'),
						property = names.shift();

					obj[property] = response.fields[0];
					let item = this.lookup(name, obj);

					interceptor.resolve(item);
				});
		} else {
			setTimeout(() => {
				interceptor.resolve(result);
			}, 10);
		}

		return interceptor;
	}

	lookup(name, data){
		let names = name.split('.'),
			property = names.shift(),
			item = data[property];

		if ( item.type === 'COMPOSITE' ) {
            for ( let prop in names ) {
                for ( let field of item.fields ) {
                    if(prop === field.name) {
                        item = field;
                        return;
                    }
                }
            }
		} else {
            for ( let prop in names ) {
                for ( let field of item.associatedEntity.fields ) {
                    if(prop === field.name) {
						item = field;
						return;
					}
                }
            }
        }

		if (item.name !== names[names.length-1]) {
            return null;
        }

		return item;
	}

	get() {
		let interceptor = new Deferred(),
			plid = Cache.get('PrivateLabel'),
			name = this.entity + '-' + plid;

		if ( Cache.has(name) ) {
			let response = Cache.get(name);
            this.entity = response.entity;
            this.entityLabel = response.label;
            this.parse(response.fields).then(() => {
                interceptor.resolve(response);
            });
		} else {
			Bullhorn
                .http()
                .get(this.endpoint, this.parameters)
                .then((response) => {
			        Cache.put(name, response);
                    return response;
                })
                .then((response) => {
        			this.entity = response.entity;
        			this.entityLabel = response.label;
        			this.parse(response.fields).then(() => {
        				interceptor.resolve(response);
        			});
        		})
                .catch( (message) => {
            		interceptor.reject(message);
                });
		}

		return interceptor;
	}

	parse(fielddata) {
		let data = {},
			interceptor = new Deferred();

		//var list = (this.parser) ? this.parser(fields) : this.defaultMetaParser(fields);
		let p = this.parser || this.defaultMetaParser;
		p.apply(this, [fielddata])
         .then((list) => {
			list.sort((a, b) => {
				try {
					if(a.label.toUpperCase() > b.label.toUpperCase()) return 1;
					if(b.label.toUpperCase() > a.label.toUpperCase()) return -1;
				} catch(e) {
					//Do nothing
				}
				return 0;
			});
			for ( let item of list ) {
            	(function(obj, field, readOnly) {
					if(!obj.cache.hasOwnProperty(field)) {
						Object.defineProperty(obj, field, {
							get: function() {
								return obj.cache[field];
							},
							set: function(value) {
								obj.cache[field] = value;
							},
							configurable: true,
							enumerable: true
						});
					}
				})(this, item.name, item.readOnly);
				data[item.name] = item;
			}
			this.all = list;
			this.cache = data;

			interceptor.resolve(data);
		});
		return interceptor;
	}

	extract(data) {
		if(!this.cache) return [];
		let cache = this.cache,
			result = [];
        for ( let item of data ) {
			let meta = cache[item];
			if(meta) {
				if (meta.name == 'id' ){
					result.unshift(meta);
				} else if (meta.name == '_score') {
					result.insertAt(meta,1) || result.push(meta);
				}
				else result.push(meta);
			}
		}
		return result;
	}

	expand(data, toManyCount) {
		let result = {};

		toManyCount = toManyCount || 0;
		//console.log('expanding', fields, me);
		for ( let field of data) {
			let name = field.split('.')[0],
                sub = field.split('.')[1],
                definition = this.cache[name];

			if(definition) {
				if(definition.associatedEntity) {
					//if(['TO_MANY'].indexOf(definition.type) > -1) name += '['+toManyCount+']';
					if(['appointments', 'approvedPlacements', 'placements', 'interviews', 'sendouts', 'submissions', 'webResponses', 'notes', 'clientContacts', 'changeRequests', 'tasks', 'workHistory', 'references', 'educations', 'jobOrders'].indexOf(definition.name) > -1) name += '[0]';

					result[name] = result[name] || { properties: [] };

					switch(definition.associatedEntity.entity) {
						case 'ClientContact':
						case 'CorporateUser':
						case 'Candidate':
						case 'Lead':
						case 'Person':
							result[name].properties.push('id', 'firstName', 'lastName');
							break;
						case 'Opportunity':
						case 'JobOrder':
							result[name].properties.push('id', 'title');
							break;
						case 'Placement':
						case 'JobSubmission':
						case 'Sendout':
							result[name].properties.push('id', 'jobOrder', 'candidate');
							break;
						case 'PlacementCommission':
							result[name].properties.push('id', 'user(id,name)', 'commissionPercentage');
							break;
						case 'PlacementChangeRequest':
							result[name].properties.push('id', 'requestType');
							break;
						case 'Note':
							result[name].properties.push('id', 'action', 'dateAdded');
							break;
						case 'Appointment':
							result[name].properties.push('id');
							break;
						case 'Task':
							result[name].properties.push('id', 'subject', 'isCompleted');
							break;
						case 'CandidateEducation':
							result[name].properties.push('id', 'degree');
							break;
						case 'CandidateWorkHistory':
							result[name].properties.push('id', 'companyName');
							break;
						case 'CandidateCertification':
							result[name].properties.push('id', 'certification(id,name)');
							break;
						case 'CandidateReference':
							result[name].properties.push('id', 'referenceFirstName','referenceLastName');
							break;
						case 'WorkersCompensationRate':
							result[name].properties.push('id', 'rate', 'compensation(code,name)');
							break;
						default:
							result[name].properties.push('id', 'name');
							break;
						}
					if(sub) {
						switch(sub) {
							case 'owner':
								result[name].properties.push(sub+'(id,firstName,lastName)');
								break;
							case 'department':
								result[name].properties.push(sub+'(id,name)');
								break;
							case 'parentClientCorporation':
								result[name].properties.push(sub+'(id,name)');
								break;
							default:
								result[name].properties.push(sub);
								break;
							}
					}
				} else {
					result[name] = result[name] || { properties: [] };
					if(sub) {
						result[name].properties.push(sub);
					}
				}
			}
		}

		var output = [];
        for ( let key in result ) {
            let value = result[key];
            if (value.properties.length > 0 && key !== 'address') {
				output.push( key + '(' + EnsureUnique(value.properties).join(',') + ')' );
			} else {
				output.push( key );
            }
        }
		return output;
	}
}

exports.Cache = Cache;
exports.Deferred = Deferred;
exports.QueryString = QueryString;
exports.HttpService = HttpService;
exports.Meta = Meta;
exports.Query = Query;
exports.Search = Search;
exports.Entity = Entity;
exports.Bullhorn = Bullhorn;