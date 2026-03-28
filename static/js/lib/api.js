const API = {
    async request(method, url, body = null) {
        const opts = { method, credentials: "same-origin", headers: {} };
        if (body && !(body instanceof FormData)) {
            opts.headers["Content-Type"] = "application/json";
            opts.body = JSON.stringify(body);
        } else if (body instanceof FormData) {
            opts.body = body;
        }
        const res = await fetch(url, opts);
        const data = await res.json();
        if (!res.ok && !data.ok) throw data;
        return data;
    },
    get(url) { return this.request("GET", url); },
    post(url, body) { return this.request("POST", url, body); },
    put(url, body) { return this.request("PUT", url, body); },
    del(url) { return this.request("DELETE", url); },
    upload(url, file) {
        const fd = new FormData();
        fd.append("file", file);
        return this.request("POST", url, fd);
    },
};

export default API;
