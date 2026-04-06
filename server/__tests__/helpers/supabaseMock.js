/**
 * Supabase mock factory.
 *
 * Provides a chainable query builder that records calls and returns
 * configurable responses. Every test can override `mockRpcResponse`
 * and `mockQueryResponse` to control what Supabase "returns".
 *
 * Usage:
 *   jest.mock('../config/db', () => require('./helpers/supabaseMock'));
 */

// ── Configurable response stores ────────────────────────────────────
let rpcResponses = {};      // keyed by function name
let queryResponses = {};    // keyed by table name
let authGetUserResult = null;

// ── Public setters (called from tests) ──────────────────────────────

/**
 * @param {string} fnName - RPC function name
 * @param {*} data        - The value to return as `data` (the RPC result)
 * @param {*} error       - The value to return as `error`
 */
function mockRpcResponse(fnName, data, error = null) {
  rpcResponses[fnName] = { data, error };
}

/**
 * Set what `await supabaseAdmin.from(table)...` resolves to.
 *
 * @param {string} table     - Table name
 * @param {object} response  - Full response object: { data, error, count? }
 */
function mockQueryResponse(table, response) {
  queryResponses[table] = response;
}

function mockAuthUser(user) {
  authGetUserResult = user;
}

function resetMocks() {
  rpcResponses = {};
  queryResponses = {};
  authGetUserResult = null;
}

// ── Chainable query builder ─────────────────────────────────────────
function createQueryBuilder(table) {
  const getResponse = () => queryResponses[table] || { data: null, error: null, count: 0 };

  const chain = {};
  const methods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
    'is', 'not', 'in', 'or', 'ilike',
    'order', 'range', 'limit',
  ];

  // Every method returns the chain so calls can be stacked
  methods.forEach(method => {
    chain[method] = jest.fn().mockReturnValue(chain);
  });

  // .single() is terminal — returns a thenable resolving to the response
  chain.single = jest.fn().mockImplementation(() => {
    const result = getResponse();
    return {
      then: (resolve, reject) => resolve ? resolve(result) : result,
      catch: () => {},
    };
  });

  chain.maybeSingle = chain.single;

  // Make the chain itself thenable (for non-.single() queries)
  chain.then = function (resolve) {
    return resolve ? resolve(getResponse()) : getResponse();
  };
  chain.catch = () => {};

  return chain;
}

// ── The mock Supabase client ────────────────────────────────────────
const supabaseAdmin = {
  auth: {
    getUser: jest.fn().mockImplementation(() => {
      if (authGetUserResult) {
        return Promise.resolve({ data: { user: authGetUserResult }, error: null });
      }
      return Promise.resolve({ data: { user: null }, error: { message: 'Invalid token' } });
    }),
    admin: {
      createUser: jest.fn(),
      deleteUser: jest.fn(),
      listUsers: jest.fn().mockResolvedValue({ data: { users: [] } }),
      updateUserById: jest.fn().mockResolvedValue({ data: { user: {} }, error: null }),
    },
    signInWithPassword: jest.fn(),
  },
  from: jest.fn().mockImplementation((table) => createQueryBuilder(table)),
  rpc: jest.fn().mockImplementation((fnName, _params) => {
    const resp = rpcResponses[fnName];
    if (resp) return Promise.resolve(resp);
    return Promise.resolve({ data: null, error: { message: `No mock for rpc: ${fnName}` } });
  }),
};

const supabaseAnon = supabaseAdmin;

module.exports = {
  supabaseAdmin,
  supabaseAnon,
  // Helpers for tests
  mockRpcResponse,
  mockQueryResponse,
  mockAuthUser,
  resetMocks,
};
