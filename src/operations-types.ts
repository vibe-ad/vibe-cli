export type HttpMethod = 'get' | 'put' | 'post' | 'delete' | 'options' | 'head' | 'patch' | 'trace';

export type JsonSchema = Record<string, unknown>;

export interface ParameterDef {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  description?: string;
  schemaType?: string;
}

export interface RequestBodyDef {
  required: boolean;
  contentType: string;
  schema: JsonSchema;
}

export interface OperationDef {
  operationId: string;
  method: HttpMethod;
  path: string;
  summary?: string;
  description?: string;
  tags: string[];
  parameters: ParameterDef[];
  body?: RequestBodyDef;
  scopes: string[];
}
