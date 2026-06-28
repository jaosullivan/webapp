{{/*
Expand the name of the chart.
*/}}
{{- define "fullstack.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to every resource.
*/}}
{{- define "fullstack.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Selector labels for a given service name.
Usage: {{ include "fullstack.selectorLabels" (dict "name" "users") }}
*/}}
{{- define "fullstack.selectorLabels" -}}
app: {{ .name }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
{{- end }}

{{/*
Image reference for a service.
Usage: {{ include "fullstack.image" (dict "root" . "svc" "users") }}
*/}}
{{- define "fullstack.image" -}}
{{ .root.Values.global.imageRegistry }}/{{ .svc }}:{{ .root.Values.global.imageTag }}
{{- end }}
