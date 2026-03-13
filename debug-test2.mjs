import ClientRequestModule from './src/lib/tools/ClientRequest.class.js';
const ClientRequest = ClientRequestModule;

ClientRequest.init({
	referrers: ['*'],
	parameters: {
		pathParameters: {
			id: (value) => {
				console.log('Global id validation called with:', value);
				return /^[0-9]+$/.test(value);
			},
			BY_ROUTE: [
				{
					route: 'users/{userId}/posts/{id}?id',  // Specify id parameter with query spec
					validate: ({ userId, id }) => {  // Multi-parameter function for multi-placeholder route
						console.log('BY_ROUTE validation called with:', { userId, id });
						console.log('Type: object');
						return /^[0-9]+$/.test(userId) && /^POST-[0-9]+$/.test(id);
					}
				}
			]
		}
	}
});

const event = {
	httpMethod: 'GET',
	resource: '/users/{userId}/posts/{id}',
	path: '/users/123/posts/POST-456',
	pathParameters: { userId: '123', id: 'POST-456' },
	queryStringParameters: {},
	headers: {},
	requestContext: {}
};

const context = {
	getRemainingTimeInMillis: () => 30000
};

const request = new ClientRequest(event, context);

console.log('isValid:', request.isValid());
console.log('pathParameters:', request.getPathParameters());
