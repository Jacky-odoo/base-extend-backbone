/**
 * @time 2012年10月19日
 * @author icepy
 * @info 实现基础的模型类
 *
 * @time 2012年10月27日
 * @author icepy
 * @info 现实对请求进行本地缓存
 *
 * @time 2016年2月27日
 * @author icepy
 * @info 改造兼容webpack打包以及扩展Model
 *
 */


'use strict';
var Backbone = require('backbone')
var Store = require('../store/locationStore');
var Config = require('config');
var Tools = require('../util/tools');
var warn = require('../util/warn');
var uid = 1314;
var expiration = Store.expiration;
var env = Config.env[Config.scheme];
var BaseModel = Backbone.Model.extend({
	options:{},
	initialize:function(options){
		this.parameter = null;
		if (_.isFunction(this.beforeEmit)) {
			this.beforeEmit(options);
		};
		this._url = this.url;
		if (!this.setEnv) { //默认使用内置{url_prefix}处理
			this._ICESetEnv();
		};
	},
	_ICESetEnv:function(){
		if (/^\{{0,2}(url_prefix)\}{0,2}/.test(this.url)) {
			this.url = this.url.replace('{{url_prefix}}',env['url_prefix']);
			this._url = this.url
		}else{
			warn('你应该正确的配置{{url_prefix}}，在你的config.js文件中')
		}
	},
	_ICEOptions:function(){
		var self = this;
		return {
			beforeSend:function(xhr,model){
				for(var setHeaderKey in self.headers){
					xhr.setRequestHeader(setHeaderKey,self.headers[setHeaderKey]);
				}
			}
		}
	},
	_ICEFetch:function(success,error){
		var self = this;
		var options = _.extend(this._ICEOptions(),this.options);
		this.fetch(_.extend({
			success:function(model,response) {
				response = self._ICEProcessData(response);
				if (_.isFunction(success)) {
					success.call(self,response);
				};
			},
			error:function(model,e){
				if (_.isFunction(error)) {
					error.call(self,e);
				};
			}
		},options));
	},
	_ICESave:function(HTTPBody,success,error){
		var self = this;
		var options = _.extend(this._ICEOptions(),this.options);
		this.save(HTTPBody,_.extend({
			success:function(model,response){
				response = self._ICEProcessData(response);
				if (_.isFunction(success)) {
					success.call(self,response);
				}
			},
			error:function(model,e){
				if (_.isFunction(error)) {
					error.call(self,e);
				};
			}
		},options));
	},
	_ICEDestroy:function(success,error){
		var self = this;
		this.destroy({
			success:function(model,response){
				if (_.isFunction(success)) {
					success.call(self,response);
				};
			},
			error:function(model,e){
				if (_.isFunction(error)) {
					error.call(self,e);
				};
			}
		});
	},
	_ICEJSONP:function(parameter,success,error){
		var self = this;
		var jsonpXHR = $.ajax({
			url:this.url,
			data:parameter || {},
			dataType:'jsonp',
			jsonp:'callback'
		});
		jsonpXHR.done(function(response,state,xhr){
			response = self._ICEProcessData(response);
			if (_.isFunction(success)) {
				success.call(self,response,state,xhr);
			};
		});
		jsonpXHR.fail(function(xhr,state,errors){
			if (_.isFunction(error)) {
				error.call(self,xhr,state,errors);
			};
		});
	},
	_ICESendHelper:function(message){
		var success = message.success;
		var error = message.error;
		if (message.url) {
			//如果存在url，将this的url替换
			this.url = message.url;
		};
		switch(message.type){
			case 'POST':
				this._ICESave(message.HTTPBody,success,error);
				break;
			case 'PUT':
				var id = message.HTTPBody.id;
				if(!id && id !== 0){
					message.HTTPBody.id = 'icepy'+(uid++);
				};
				this._ICESave(message.HTTPBody,success,error);
				break;
			case 'DELETE':
				this._ICEDestroy(success,error);
				break;
			case 'JSONP':
				this._ICEJSONP(message.parameter,success,error);
				break;
			default:
				this._ICEFetch(success,error);
				break;
		}
	},
	_ICESendMessage:function(message){
		var self = this;
		if (this.storageCache && this.expiration){
			if (!Store.enabled){
				this._ICESendHelper(message);
			}else{
				var data = expiration.get(this.url);
				if (!data) {
					this._ICESendHelper(message);
					return false;
				};
				var success = message.success;
				if (_.isFunction(success)) {
					setTimeout(function(){
						data = self._ICEProcessData(data,true);
						success.call(self,data);
					},50);
				}
			};
		}else{
			this._ICESendHelper(message);
		};
	},
	_ICEProcessData:function(response,before){
		//如果自定义了formatter方法，先对数据进行格式化
		if (_.isFunction(this.formatter)) {
			response = this.formatter(response);
		};
		//如果开启了缓存，对数据源进行本地存储
		if (this.storageCache && this.expiration && !before) {
			if (Store.enabled){
				expiration.set(this.url,response,this.expiration);
			};
		};
		this.set(response);
		return response;
	},
	/**
	 * [execute GET请求简化版]
	 * @param  {[type]} success [description]
	 * @param  {[type]} error   [description]
	 * @return {[type]}         [description]
	 */
	execute:function(){
		var message = {
			type:'GET'
		};
		var args = Tools.toArray(arguments);
		var g = args.splice(0,1)[0];
		if (Tools.isPlainObject(g)) {
			message = _.extend(message,g);
			message.success = args[0];
			message.error = args[1];
		}else{
			message.success = g;
			message.error = args[0];
		}
		this._ICESendMessage(message);
	},
	/**
	 * [executeGET 发起GET请求]
	 * @param  {[type]} success [description]
	 * @param  {[type]} error   [description]
	 * @return {[type]}         [description]
	 */
	executeGET:function(success,error){
		var message = {
			type:'GET',
			success:success,
			error:error
		};
		this.execute(message);
	},
	/**
	 * [executePOST 发起POST请求]
	 * @param  {[type]} HTTPBody [description]
	 * @param  {[type]} success  [description]
	 * @param  {[type]} error    [description]
	 * @return {[type]}          [description]
	 */
	executePOST:function(HTTPBody,success,error){
		var message = {
			type:'POST',
			HTTPBody:HTTPBody,
			success:success,
			error:error
		};
		this.execute(message);
	},
	/**
	 * [executePUT 发起PUT请求]
	 * @param  {[type]} HTTPBody [description]
	 * @param  {[type]} success  [description]
	 * @param  {[type]} error    [description]
	 * @return {[type]}          [description]
	 */
	executePUT:function(HTTPBody,success,error){
		var message = {
			type:'PUT',
			HTTPBody:HTTPBody,
			success:success,
			error:error
		};
		this.execute(message);
	},
	/**
	 * [executeDELETE 发起delete请求]
	 * @return {[type]} [description]
	 */
	executeDELETE:function(){
		var message = {
			type:'DELETE',
			success:success,
			error:error
		};
		this.execute(message);
	},
	/**
	 * [executeJSONP 发起JSONP跨域请求]
	 * @param  {[type]} success [description]
	 * @param  {[type]} error   [description]
	 * @return {[type]}         [description]
	 */
	executeJSONP:function(parameter,success,error){
		var message = {
			type:'JSONP',
			success:success,
			error:error,
			parameter:parameter
		};
		this.execute(message);
	},
	/**
	 * [setChangeURL 辅助拼接URL参数]
	 * @param {[type]} parameter [description]
	 */
	setChangeURL:function(parameter){
		var url = ''
		if (!parameter) {
			return;
		};
		for(var key in parameter){
			var value = parameter[key];
			if (!url.length) {
				url = this._url.replace('{{'+key+'}}',value);
			}else{
				url = url.replace('{{'+key+'}}',value);
			};
		};
		this.url = url;
	},
	/**
	 * [setHeaders 设置XHR 头信息]
	 * @param {[type]} headers [description]
	 */
	setHeaders:function(headers){
		this.headers = null;
		this.headers = headers;
	},
	/**
	 * [setUpdateStore 将实体数据更新到本地缓存]
	 * @return {[type]} [description]
	 */
	setUpdateStore:function(){
		if (Store.enabled){
			expiration.set(self.url,this.manager.$get(),self.expiration);
		};
	}
});
module.exports = BaseModel;
