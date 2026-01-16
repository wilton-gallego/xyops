// xyOps API Layer - OpenTelemetry
// Copyright (c) 2019 - 2026 PixlCore LLC
// Released under the BSD 3-Clause License.
// See the LICENSE.md file in this repository.

const Tools = require("pixl-tools");

function parseOtelValue(value) {
	if (!value || (typeof(value) != 'object')) return null;
	if (value.stringValue !== undefined) return value.stringValue;
	if (value.boolValue !== undefined) return !!value.boolValue;
	if (value.intValue !== undefined) return parseInt(value.intValue, 10);
	if (value.doubleValue !== undefined) return Number(value.doubleValue);
	if (value.arrayValue && Array.isArray(value.arrayValue.values)) {
		return value.arrayValue.values.map(parseOtelValue);
	}
	if (value.kvlistValue && Array.isArray(value.kvlistValue.values)) {
		return value.kvlistValue.values.reduce(function(acc, item) {
			acc[item.key] = parseOtelValue(item.value);
			return acc;
		}, {});
	}
	return null;
}

function parseOtelAttributes(attrs) {
	var output = {};
	(attrs || []).forEach(function(attr) {
		if (!attr || !attr.key) return;
		output[attr.key] = parseOtelValue(attr.value);
	});
	return output;
}

function parseOtelDataPoint(point, base) {
	var value = null;
	if (point.asDouble !== undefined) value = Number(point.asDouble);
	else if (point.asInt !== undefined) value = parseInt(point.asInt, 10);
	else if (point.sum !== undefined) value = Number(point.sum);
	else if (point.count !== undefined) value = Number(point.count);

	return Tools.mergeHashes(base || {}, {
		value: value,
		attributes: parseOtelAttributes(point.attributes),
		startTimeUnixNano: point.startTimeUnixNano,
		timeUnixNano: point.timeUnixNano,
		count: point.count,
		sum: point.sum,
		bucketCounts: point.bucketCounts,
		explicitBounds: point.explicitBounds,
		quantileValues: point.quantileValues,
		scale: point.scale,
		zeroCount: point.zeroCount,
		positive: point.positive,
		negative: point.negative,
		flags: point.flags
	});
}

function normalizeMetric(metric, scope, resourceAttributes) {
	var metricBase = {
		name: metric.name,
		unit: metric.unit || '',
		description: metric.description || '',
		scope: scope || {},
		resource: resourceAttributes || {}
	};

	if (metric.gauge) {
		return {
			type: 'gauge',
			base: metricBase,
			dataPoints: (metric.gauge.dataPoints || []).map(function(point) {
				return parseOtelDataPoint(point, { type: 'gauge' });
			})
		};
	}
	if (metric.sum) {
		return {
			type: 'sum',
			base: Tools.mergeHashes(metricBase, {
				aggregationTemporality: metric.sum.aggregationTemporality,
				isMonotonic: metric.sum.isMonotonic
			}),
			dataPoints: (metric.sum.dataPoints || []).map(function(point) {
				return parseOtelDataPoint(point, { type: 'sum' });
			})
		};
	}
	if (metric.histogram) {
		return {
			type: 'histogram',
			base: Tools.mergeHashes(metricBase, {
				aggregationTemporality: metric.histogram.aggregationTemporality
			}),
			dataPoints: (metric.histogram.dataPoints || []).map(function(point) {
				return parseOtelDataPoint(point, { type: 'histogram' });
			})
		};
	}
	if (metric.summary) {
		return {
			type: 'summary',
			base: metricBase,
			dataPoints: (metric.summary.dataPoints || []).map(function(point) {
				return parseOtelDataPoint(point, { type: 'summary' });
			})
		};
	}
	if (metric.exponentialHistogram) {
		return {
			type: 'exponential_histogram',
			base: Tools.mergeHashes(metricBase, {
				aggregationTemporality: metric.exponentialHistogram.aggregationTemporality
			}),
			dataPoints: (metric.exponentialHistogram.dataPoints || []).map(function(point) {
				return parseOtelDataPoint(point, { type: 'exponential_histogram' });
			})
		};
	}

	return null;
}

function buildOtelSnapshot(payload) {
	var snapshot = {
		received: Tools.timeNow(true),
		metrics: {},
		series: [],
		resources: []
	};

	(payload.resourceMetrics || []).forEach(function(resourceMetric) {
		var resourceAttributes = parseOtelAttributes(resourceMetric.resource && resourceMetric.resource.attributes);
		var resourceEntry = {
			attributes: resourceAttributes,
			scopeMetrics: []
		};

		(resourceMetric.scopeMetrics || []).forEach(function(scopeMetric) {
			var scope = scopeMetric.scope || {};
			var scopeEntry = {
				scope: scope,
				metrics: []
			};

			(scopeMetric.metrics || []).forEach(function(metric) {
				var normalized = normalizeMetric(metric, scope, resourceAttributes);
				if (!normalized) return;

				scopeEntry.metrics.push(normalized);

				normalized.dataPoints.forEach(function(point) {
					snapshot.series.push(Tools.mergeHashes(normalized.base, point));
					if ((point.value !== null) && (point.value !== undefined)) {
						snapshot.metrics[normalized.base.name] = point.value;
					}
				});
			});

			resourceEntry.scopeMetrics.push(scopeEntry);
		});

		snapshot.resources.push(resourceEntry);
	});

	return snapshot;
}

function findOtelServerId(payload, explicitServerId) {
	if (explicitServerId) return explicitServerId;
	var resourceMetrics = payload.resourceMetrics || [];
	for (var idx = 0; idx < resourceMetrics.length; idx++) {
		var attributes = parseOtelAttributes(resourceMetrics[idx].resource && resourceMetrics[idx].resource.attributes);
		if (attributes['xyops.server_id']) return attributes['xyops.server_id'];
		if (attributes['xyops.server.id']) return attributes['xyops.server.id'];
		if (attributes['xyops.server']) return attributes['xyops.server'];
		if (attributes['server.id']) return attributes['server.id'];
	}
	return null;
}

class OTel {
	api_otel_ingest(args, callback) {
		var self = this;
		if (!this.requireMaster(args, callback)) return;

		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireValidUser(session, user, callback)) return;
			if (!self.requirePrivilege(user, 'ingest_otel', callback)) return;

			var payload = args.params || {};
			var explicitServerId = args.query.server_id || payload.server_id || args.request.headers['x-xyops-server-id'];
			var serverId = findOtelServerId(payload, explicitServerId);

			if (!serverId) {
				return self.doError('otel', "No server_id provided and none could be inferred from resource attributes.", callback);
			}

			var server = self.servers[serverId];
			if (!server) {
				var servers = Object.values(self.servers || {});
				server = Tools.findObject(servers, { hostname: serverId });
				if (server) serverId = server.id;
			}

			if (!server) {
				return self.doError('otel', "Server not found or offline: " + serverId, callback);
			}

			if (!payload.resourceMetrics || !Array.isArray(payload.resourceMetrics)) {
				return self.doError('otel', "Invalid OTLP payload: resourceMetrics array is required.", callback);
			}

			var snapshot = buildOtelSnapshot(payload);

			if (!self.otelCache) self.otelCache = {};
			self.otelCache[serverId] = {
				received: snapshot.received,
				payload: snapshot,
				ttl: 300
			};

			callback({ code: 0, server_id: serverId, received: snapshot.received });
		});
	}
}

module.exports = OTel;
