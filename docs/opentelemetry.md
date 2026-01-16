# OpenTelemetry (OTel)

xyOps now accepts **OpenTelemetry metrics** via OTLP/HTTP **JSON** and merges them into the existing monitoring pipeline. Traces are not ingested at this time; only metrics are supported.

## Connection method and ports

OpenTelemetry exporters should send OTLP/HTTP JSON to the xyOps API. The endpoint is served by the same Web UI/API ports:

- **HTTP / WS**: `WebServer.port` (default `5522`)
- **HTTPS / WSS**: `WebServer.https_port` (default `5523`)

## OTLP metrics ingest endpoint

**Endpoint:** `POST /api/app/otel_ingest`  
**Auth:** API Key required (use `X-API-Key` header or `api_key` query/body param).  
**Privilege:** `ingest_otel`

### Server mapping

Metrics are associated with an existing **online** server (xySat connected). Provide one of the following:

- `server_id` query param or JSON field
- `X-XYOPS-Server-Id` header
- OTLP resource attributes (first match wins):
  - `xyops.server_id`
  - `xyops.server.id`
  - `xyops.server`
  - `server.id`

If no server ID is provided, xyOps attempts to match `host.name` to an online server hostname.

### Where metrics appear

Ingested metrics are merged into the next minute of monitor data and are available to monitors as:

- `commands.otel.metrics["metric.name"]` (simple numeric value)
- `commands.otel.series` (array of datapoints with attributes, unit, type, etc.)
- `commands.otel.resources` (full resource/scope breakdown)

### Example: OpenTelemetry Collector (OTLP/HTTP JSON)

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318

exporters:
  otlphttp:
    endpoint: "https://xyops.example.com:5523/api/app/otel_ingest?server_id=srv01"
    headers:
      X-API-Key: "YOUR_XYOPS_API_KEY"
    encoding: json

service:
  pipelines:
    metrics:
      receivers: [otlp]
      exporters: [otlphttp]
```

### Example monitor expressions

1. **Service CPU usage** (from `system.cpu.utilization`):

```
commands.otel.metrics["system.cpu.utilization"]
```

2. **Filter by attribute in a series** (e.g., only `state=system`):

```
commands.otel.series.filter(s => s.name == "system.cpu.utilization" && s.attributes.state == "system")[0].value
```

## Notes and limitations

- OTLP/HTTP **JSON** is required (`encoding: json`). Protobuf OTLP is not accepted.
- Metrics are **merged once per minute** with the regular xySat monitoring cycle.
- Traces are not ingested; export traces to a separate OTel backend.
