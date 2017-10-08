'use strict';

const Promise = require('bluebird');
const httpErrors = require('http-errors');
const statuses = require('statuses');
const _ = require('lodash');

const assembleLambdaHandler = (preprocessor, dataHandler, errorHandler) => {
	return fn => {
		return (event, context, callback) => {
			context.callbackWaitsForEmptyEventLoop = false;
			try {
				Promise.resolve([event, context])
					.spread(preprocessor)
					.spread(fn)
					.then(data => dataHandler(data, callback, context))
					.catch(error => errorHandler(error, callback, context));
			} catch (error) {
				errorHandler(error, callback, context);
			}
		};
	};
};

const preprocessorPassthrough = (event, context) => [event, context];
const dataHandlerPassthrough = (data, callback) => callback(null, data);
const errorHandlerPassthrough = (error, callback) => callback(error);

const preprocessorBodyJson = (event, context) => {
	try {
		if (event.body) {
			event.body = JSON.parse(event.body);
		}
	} catch (error) {
		console.error(`Failed to parse event.body JSON: '${event.body}'`);
		throw new httpErrors.InternalServerError('Invalid body JSON');
	}
	return [event, context];
};

const decodeEventBody64 = event => {
	if (!event.body64) {
		throw new httpErrors.InternalServerError('No base64-encoded body found');
	}

	if (event.body) {
		throw new httpErrors.InternalServerError('Event already contains body in addition to body64');
	}

	try {
		return new Buffer(event.body64, 'base64').toString();
	} catch (error) {
		console.error(`Failed to decode event.body64: '${event.body64}'`);
		throw new httpErrors.InternalServerError('Failed to decode base64-encoded body');
	}
};

const preprocessorBody64 = (event, context) => {
	event.body = decodeEventBody64(event);
	return [event, context];
};

const preprocessorBody64FormUrlEncoded = (event, context) => {
	const body = decodeEventBody64(event);

	event.body = {};

	const pairs = body.split('&');

	pairs.forEach(pair => {
		try {
			const splitPair = pair.split('=');
			if (splitPair.length !== 2) {
				throw new Error(`Invalid pair length ${splitPair.length}`);
			}
			const key = decodeURIComponent(splitPair[0].replace(/\+/g, ' '));
			const value = decodeURIComponent(splitPair[1].replace(/\+/g, ' '));
			event.body[key] = value;
		} catch(error) {
			console.error(`Failed to parse base64-decoded event.body64 '${body}' on pair '${pair}'`);
			throw new httpErrors.BadRequest('Failed to parse form-url-encoded body');
		}
	});

	return [event, context];
};

const dataHandlerApi = (data, callback) => {
	let response;

	if (_.isPlainObject(data) && data.hasOwnProperty('statusCode')) {
		if (typeof data.statusCode !== 'number') {
			throw new httpErrors.InternalServerError('Handler returned invalid status code');
		}
		response = {
			statusCode: data.statusCode,
			body: _.get(data, 'body', ''),
			headers: _.get(data, 'headers', {}),
		};
	} else {
		response = {
			statusCode: 200,
			body: data,
			headers: {},
		};
	}

	if (typeof response.body !== 'string') {
		response.body = JSON.stringify(response.body);
	}

	callback(null, response);
};

const errorHandlerApi = (error, callback) => {
	let response = {};
	let errors = [];
	if (error instanceof httpErrors.HttpError) {
		errors.push({
			status: `${error.statusCode}`,
			title: statuses[error.statusCode],
			detail: error.message,
		});
		response.statusCode = error.statusCode;
	} else {
		errors.push({
			status: '500',
			title: 'Internal Server Error',
			detail: 'Unexpected internal server error',
		});
		response.statusCode = 500;
		console.error('Unexpected internal server error:', error);
	}
	response.body = JSON.stringify({ errors });
	response.headers = {};
	callback(null, response);
};

const lambda = assembleLambdaHandler(
	preprocessorPassthrough,
	dataHandlerPassthrough,
	errorHandlerPassthrough
);

const api = assembleLambdaHandler(
	preprocessorBodyJson,
	dataHandlerApi,
	errorHandlerApi
);

const postRaw = assembleLambdaHandler(
	preprocessorBody64,
	dataHandlerPassthrough,
	errorHandlerPassthrough
);

const postFormUrlEncoded = assembleLambdaHandler(
	preprocessorBody64FormUrlEncoded,
	dataHandlerPassthrough,
	errorHandlerPassthrough
);

module.exports = {
	assembleLambdaHandler,
	preprocessorPassthrough,
	dataHandlerPassthrough,
	errorHandlerPassthrough,
	preprocessorBodyJson,
	decodeEventBody64,
	preprocessorBody64,
	preprocessorBody64FormUrlEncoded,
	dataHandlerApi,
	errorHandlerApi,
	lambda,
	api,
	postRaw,
	postFormUrlEncoded,
};

