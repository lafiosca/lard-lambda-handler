# lard-lambda-handler

A collection of wrapper functions for building AWS Lambda handlers from promise-generating functions.

## lambda(fn)

Returns an event handler function for use with AWS Lambda. The `fn` function
provided is the handler implementation written in the promise-based style.
`fn` takes the `event` and `context` as its first two arguments, and is
expected to return a promise whose resolved value will be passed as the
successful result of the lambda callback. Any error that is thrown within
the promise or chain of promises will be caught and returned as the error
result of the Lambda callback. If function throws an error outside of the
promise chain, it will also be caught and handled.

### Example:

```
const lambda = require('lard-lambda-handler').lambda;
module.exports.handler = lambda(event => SomeService.fetchSomething(event.someId));
```


## api(fn)

Similar to `lambdaHandler` but converts the results of the promise into an API Gateway response, which looks something like:

```
{
  "statusCode": 200,
  "headers": {
    "Content-Type": "text/html"
  },
  "body": "{ \"foo\": \"bar\" }"
}
```

The response is constructed from the promise using the following rules:

* If the promise is fulfilled with the value `result`...
    * If `result.statusCode` is set, use `result` as the whole response.
    * Otherwise, create a response with `result` as the `body`, a default `statusCode` of 200, and empty `headers`.
* If the promise is rejected with `error`...
    * If `error` is an instance of HttpError, use its `statusCode` with the corresponding error message as `body`.
    * Otherwise, return a generic server error response with a `statusCode` of 500.

In any case, if `body` is not a string, it will be JSON-stringified. This allows you to return objects from your handler and have them automatically converted for API Gateway.

### Example:

```
const httpErrors = require('http-errors');
const api = require('lard-lambda-handler').api;

module.exports.handler = api(event => {
	const docId = event.pathParameters.documentId;
	return SomeService.fetchDocument(docId)
		.then(document => {
			if (!document) {
				throw new httpErrors.NotFound(`No document found with id ${docId}`);
			}
			if (document.secure) {
				return {
					statusCode: 403,
					body: `Document with id ${docId} is secure`,
				};
			}
			return document;  // default to statusCode 200
		});
});
```


## postFormUrlEncoded(fn)

Preprocesses an `event.body64` base64-encoded form-url-encoded input into an `event.body` object before running `fn`. Returns the raw response from `fn`.


## postRaw(fn)

Preprocesses an `event.body64` base64-encoded raw post input into an `event.body` object before running `fn`. Returns the raw response from `fn`.

