import { Readable } from 'node:stream';

// The API only needs a streamed request and JSON response. No listening socket is
// opened in Functions, and the existing body-size checks still run on the stream.
export function createFetchAdapter(handler) {
  return async (request, clientIp) => {
    const req = request.body ? Readable.fromWeb(request.body) : Readable.from([]);
    req.url = request.url;
    req.method = request.method;
    req.headers = Object.fromEntries(request.headers);
    req.socket = { remoteAddress: clientIp };
    const headers = new Headers();
    let response;
    const res = {
      headersSent: false,
      setHeader(name, value) {
        headers.set(name, value);
      },
      writeHead(status, values) {
        this.statusCode = status;
        for (const [name, value] of Object.entries(values)) headers.set(name, value);
        this.headersSent = true;
      },
      end(body) {
        response = new Response(body, { status: this.statusCode, headers });
      },
      destroy() {
        throw Error('API response was interrupted.');
      },
    };
    try {
      await handler(req, res);
      if (!response) throw Error('API did not return a response.');
      return response;
    } finally {
      req.destroy();
    }
  };
}
