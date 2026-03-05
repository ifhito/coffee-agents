type SupabaseResponse<T> = {
  data: T;
  error: { message: string } | null;
};

type QueryResult<T> = Promise<SupabaseResponse<T>>;

type CallsMap = {
  from: Array<[string]>;
  select: Array<[string]>;
  gte: Array<[string, number]>;
  lte: Array<[string, number]>;
  eq: Array<[string, unknown]>;
  ilike: Array<[string, string]>;
  order: Array<[string, { ascending: boolean }]>;
  limit: Array<[number]>;
  single: Array<[]>;
  maybeSingle: Array<[]>;
};

export function createSupabaseClientMock<T>(result: SupabaseResponse<T>) {
  const calls: CallsMap = {
    from: [],
    select: [],
    gte: [],
    lte: [],
    eq: [],
    ilike: [],
    order: [],
    limit: [],
    single: [],
    maybeSingle: [],
  };

  const query = {
    select: (fields: string) => {
      calls.select.push([fields]);
      return query;
    },
    gte: (field: string, value: number) => {
      calls.gte.push([field, value]);
      return query;
    },
    lte: (field: string, value: number) => {
      calls.lte.push([field, value]);
      return query;
    },
    eq: (field: string, value: unknown) => {
      calls.eq.push([field, value]);
      return query;
    },
    ilike: (field: string, pattern: string) => {
      calls.ilike.push([field, pattern]);
      return query;
    },
    order: (field: string, options: { ascending: boolean }) => {
      calls.order.push([field, options]);
      return query;
    },
    limit: async (value: number): QueryResult<T> => {
      calls.limit.push([value]);
      return result;
    },
    single: async (): QueryResult<T> => {
      calls.single.push([]);
      return result;
    },
    maybeSingle: async (): QueryResult<T> => {
      calls.maybeSingle.push([]);
      return result;
    },
  };

  const client = {
    from: (table: string) => {
      calls.from.push([table]);
      return query;
    },
  };

  return { client, calls };
}
