import os


def setup_tracing(service_name: str) -> None:
    """Configure OpenTelemetry OTLP tracing. No-op when OTEL_EXPORTER_OTLP_ENDPOINT is unset."""
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "")
    if not endpoint:
        return
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.resources import Resource, SERVICE_NAME
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

        provider = TracerProvider(resource=Resource.create({SERVICE_NAME: service_name}))
        exporter = OTLPSpanExporter(endpoint=endpoint, insecure=True)
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)
    except ImportError:
        pass  # OTel SDK not installed — tracing silently disabled
