/*
An in-memory stand-in for supabase-js, loaded in place of the real library so
the app runs in a browser test without touching the real Supabase project.

Tests set it up before the app loads, through window.fakeSupabase:

tables  rows by table name, used by sb.from(...)
rpc     replies by function name: (args, tables) => data

Every call is recorded in window.fakeSupabase.calls.
*/
(() => {
    const fake =
        window.fakeSupabase ||
        (window.fakeSupabase = {});

    fake.tables = fake.tables || {};
    fake.rpc = fake.rpc || {};
    fake.calls = [];

    let nextId = 0;

    function query(table) {
        const state = {
            op: "select",
            payload: null,
            filters: [],
            single: false
        };

        function matches(row) {
            return state.filters.every(
                ([column, value, kind]) =>
                    !(column in row) ||
                    (
                        kind === "in"
                            ? value.includes(row[column])
                            : row[column] === value
                    )
            );
        }

        function run() {
            const rows =
                fake.tables[table] ||
                (fake.tables[table] = []);

            let data;

            if (state.op === "insert" || state.op === "upsert") {
                data = [].concat(state.payload).map(item => ({
                    id: `fake-${++nextId}`,
                    created_at: new Date(Date.now() + nextId).toISOString(),
                    ...item
                }));
                rows.push(...data);
            } else if (state.op === "update") {
                data = rows.filter(matches);
                data.forEach(row => Object.assign(row, state.payload));
            } else if (state.op === "delete") {
                data = rows.filter(matches);
                fake.tables[table] = rows.filter(row => !matches(row));
            } else {
                data = rows.filter(matches);
            }

            fake.calls.push({ table, op: state.op, payload: state.payload });

            data = JSON.parse(JSON.stringify(data));

            if (state.single) {
                data = data[0] ?? null;
            }

            return { data, error: null };
        }

        const builder = new Proxy({}, {
            get(_, method) {
                if (method === "then") {
                    return (resolve, reject) =>
                        Promise.resolve(run()).then(resolve, reject);
                }

                return (...args) => {
                    if (["insert", "update", "upsert", "delete"].includes(method)) {
                        state.op = method;
                        state.payload = args[0];
                    } else if (method === "eq") {
                        state.filters.push([args[0], args[1], "eq"]);
                    } else if (method === "in") {
                        state.filters.push([args[0], args[1], "in"]);
                    } else if (method === "single" || method === "maybeSingle") {
                        state.single = true;
                    }

                    return builder;
                };
            }
        });

        return builder;
    }

    const image =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    const anonymousUser = {
        id: "anonymous-user",
        is_anonymous: true
    };

    const client = {
        from: query,

        async rpc(name, args) {
            fake.calls.push({ rpc: name, args });

            const reply = fake.rpc[name];

            return {
                data: reply ? reply(args, fake.tables) : null,
                error: null
            };
        },

        storage: {
            from: () => ({
                upload: async path => ({ data: { path }, error: null }),
                remove: async () => ({ data: [], error: null }),
                createSignedUrl: async () => ({ data: { signedUrl: image }, error: null }),
                createSignedUrls: async paths => ({
                    data: paths.map(path => ({ path, signedUrl: image })),
                    error: null
                })
            })
        },

        auth: {
            getSession: async () => ({ data: { session: null }, error: null }),
            getUser: async () => ({ data: { user: null }, error: null }),
            signInAnonymously: async () => ({
                data: { user: anonymousUser, session: { user: anonymousUser } },
                error: null
            }),
            signOut: async () => ({ error: null }),
            onAuthStateChange: () => ({
                data: { subscription: { unsubscribe() {} } }
            })
        },

        channel() {
            const channel = {
                on: () => channel,
                subscribe: () => channel,
                unsubscribe() {}
            };

            return channel;
        },

        removeChannel: async () => {}
    };

    window.supabase = {
        createClient: () => client
    };
})();
