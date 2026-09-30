import type { ApiErrorBody, ApiErrorCode } from '../../types/api';

/**
 * The codes a client can report: the gateway's own, plus the two a transport failure produces when no
 * answer exists at all. A server code is never invented here, and a transport failure is never dressed
 * up as one: the copy below says either what the gateway said or that the gateway was not reached.
 */
export type ClientErrorCode = ApiErrorCode | 'network_error' | 'unreadable_response';

/** Loopback address of the local gateway (`KR_HOST`/`KR_PORT` defaults). Public by design: not a secret. */
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:4310';

/** Base URL of the gateway. The only place in the frontend that knows where the API lives. */
export const API_BASE_URL = process.env.NEXT_PUBLIC_KR_API_URL ?? DEFAULT_API_BASE_URL;

/**
 * Spanish copy per gateway code. Keys mirror the contract, so adding a code to `ApiErrorCode`
 * fails the typecheck here until it has a message.
 */
const ERROR_COPY = {
  invalid_input: 'El gateway rechazo los datos enviados.',
  namespace_taken: 'Ese namespace ya esta en uso por otra credencial.',
  auth_kind_unsupported: 'Ese tipo de autenticacion todavia no se puede guardar.',
  unsupported_provider: 'El proveedor no esta registrado en el gateway.',
  credential_not_found: 'La credencial ya no existe.',
  secret_not_found: 'La credencial no tiene un secreto guardado.',
  secret_undecryptable: 'El secreto guardado no se puede descifrar en esta instalacion.',
  secret_key_unavailable: 'La clave de cifrado del gateway no esta disponible.',
  policy_not_found: 'La regla de politica ya no existe.',
  invalid_policy_rule: 'La regla de politica no es valida.',
  model_not_found: 'Ese modelo no esta disponible para el gateway.',
  chat_not_supported: 'El proveedor de ese modelo no soporta el protocolo de chat.',
  invalid_chat_request: 'La peticion de chat no cumple el contrato del gateway.',
  invalid_body: 'La peticion no cumple el contrato del gateway.',
  provider_failure: 'El proveedor no respondio correctamente.',
  route_not_found: 'El gateway no reconoce esa ruta.',
  request_rejected: 'El gateway rechazo la peticion.',
  internal_error: 'El gateway fallo al procesar la peticion.',
  network_error: 'No hay respuesta del gateway. Verifica que este corriendo en la URL configurada.',
  unreadable_response: 'El gateway respondio con un cuerpo que no se pudo leer.',
} satisfies Record<ClientErrorCode, string>;

const FALLBACK_COPY = 'Ocurrio un error inesperado al hablar con el gateway.';

function isClientErrorCode(value: string): value is ClientErrorCode {
  return Object.prototype.hasOwnProperty.call(ERROR_COPY, value);
}

/** Failure of one API call, already mapped to a stable code. Never carries a secret. */
export class ApiError extends Error {
  /** HTTP status, or 0 when the request never reached the gateway. */
  readonly status: number;

  readonly code: ClientErrorCode;

  /** Secret-free message produced by the gateway, kept for diagnostics. */
  readonly detail: string;

  constructor(status: number, code: ClientErrorCode, detail: string) {
    super(code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

/** Spanish message for any thrown value. Components never translate codes themselves. */
export function describeApiError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return FALLBACK_COPY;
  }

  return ERROR_COPY[error.code] ?? FALLBACK_COPY;
}

function codeFromStatus(status: number): ClientErrorCode {
  if (status === 404) {
    return 'route_not_found';
  }

  if (status === 400) {
    return 'invalid_body';
  }

  if (status >= 500) {
    return 'internal_error';
  }

  return 'request_rejected';
}

/** The contract says every non-2xx answer is `{ error: { code, message } }`; anything else is mapped by status. */
async function readErrorBody(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    const error = body.error;

    if (error !== undefined && typeof error.code === 'string') {
      return new ApiError(
        response.status,
        isClientErrorCode(error.code) ? error.code : codeFromStatus(response.status),
        typeof error.message === 'string' ? error.message : '',
      );
    }
  } catch {
    // Falls through to the status-based mapping: the body was not JSON.
  }

  return new ApiError(response.status, codeFromStatus(response.status), '');
}

export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH';
  readonly body?: unknown;
}

/**
 * The only function in the frontend that performs HTTP. Returns the parsed JSON body and throws
 * `ApiError` for network failures and non-2xx answers.
 */
export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body } = options;

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'network_error', '');
  }

  if (!response.ok) {
    throw await readErrorBody(response);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(response.status, 'unreadable_response', '');
  }
}
