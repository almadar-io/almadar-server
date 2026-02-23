// src/utils/queryFilters.ts
var OPERATOR_MAP = {
  "eq": "==",
  "neq": "!=",
  "gt": ">",
  "gte": ">=",
  "lt": "<",
  "lte": "<=",
  "contains": "array-contains",
  "contains_any": "array-contains-any",
  "in": "in",
  "not_in": "not-in",
  // Date operators map to same comparison operators
  "date_eq": "==",
  "date_gte": ">=",
  "date_lte": "<="
};
var RESERVED_PARAMS = /* @__PURE__ */ new Set([
  "page",
  "pageSize",
  "limit",
  "offset",
  "search",
  "q",
  "sortBy",
  "sortOrder",
  "orderBy",
  "orderDirection"
]);
function parseQueryFilters(query) {
  const filters = [];
  for (const [key, value] of Object.entries(query)) {
    if (RESERVED_PARAMS.has(key)) continue;
    if (value === void 0 || value === null || value === "") continue;
    const match = key.match(/^(.+)__(\w+)$/);
    if (match) {
      const [, field, op] = match;
      const firestoreOp = OPERATOR_MAP[op];
      if (firestoreOp) {
        filters.push({
          field,
          operator: firestoreOp,
          value: parseValue(value, op)
        });
      } else {
        filters.push({
          field: key,
          operator: "==",
          value: parseValue(value, "eq")
        });
      }
    } else {
      filters.push({
        field: key,
        operator: "==",
        value: parseValue(value, "eq")
      });
    }
  }
  return filters;
}
function parseValue(value, operator) {
  if (operator === "in" || operator === "not_in" || operator === "contains_any") {
    if (typeof value === "string") {
      return value.split(",").map((v) => v.trim());
    }
    if (Array.isArray(value)) {
      return value;
    }
    return [value];
  }
  if (typeof value === "string") {
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        return num;
      }
    }
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return value;
}
function applyFiltersToQuery(collection, filters) {
  let query = collection;
  for (const filter of filters) {
    query = query.where(
      filter.field,
      filter.operator,
      filter.value
    );
  }
  return query;
}
function extractPaginationParams(query, defaults = {}) {
  return {
    page: parseInt(query.page, 10) || defaults.page || 1,
    pageSize: parseInt(query.pageSize, 10) || parseInt(query.limit, 10) || defaults.pageSize || 20,
    sortBy: query.sortBy || query.orderBy,
    sortOrder: query.sortOrder || query.orderDirection || defaults.sortOrder || "asc"
  };
}

export { applyFiltersToQuery, extractPaginationParams, parseQueryFilters };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map