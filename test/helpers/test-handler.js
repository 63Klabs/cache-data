const { ClientRequest, Response } = require("../../src/lib/tools");

exports.handler = function( event, context ) {

    const req = new ClientRequest(event, context);

    const resp = new Response(req, {statusCode: 200, headers: {}, body: "hello!"});

    return resp.finalize();
}