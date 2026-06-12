CREATE TABLE public.rate_limits (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  function_name TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rate_limits_user_function_time
  ON public.rate_limits (user_id, function_name, requested_at);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Grant service_role full access (Edge Functions use service_role)
GRANT ALL ON TABLE public.rate_limits TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.rate_limits_id_seq TO service_role;
