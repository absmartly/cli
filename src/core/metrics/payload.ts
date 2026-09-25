// Shared camelCase → snake_case mapping for metric fields, used by both
// createMetric (fresh metric) and createMetricVersion (new draft version).

export interface MetricFields {
  name?: string | undefined;
  type?: string | undefined;
  description?: string | undefined;
  effect?: string | undefined;
  goalId?: number | undefined;
  owner?: number | undefined;

  formatStr?: string | undefined;
  scale?: number | undefined;
  precision?: number | undefined;
  meanFormatStr?: string | undefined;
  meanScale?: number | undefined;
  meanPrecision?: number | undefined;

  outlierLimitMethod?: string | undefined;
  valueSourceProperty?: string | undefined;
  propertyFilter?: unknown | undefined;

  // Numerator-side details (also used when the metric type itself is
  // goal_retention / goal_activity_period_count / custom_sql).
  retentionTime?: string | undefined;
  retentionTimeReference?: string | undefined;
  activityInterval?: string | undefined;
  customSql?: string | undefined;
  customStatisticsType?: string | undefined;
  datasourceId?: number | undefined;
  vrLookbackInterval?: string | undefined;
  relationKind?: string | undefined;
  relationRefundOperation?: string | undefined;
  relationForeignDuplicateOperation?: string | undefined;

  // Denominator-side — only meaningful for goal_ratio.
  numeratorType?: string | undefined;
  denominatorType?: string | undefined;
  denominatorGoalId?: number | undefined;
  denominatorValueSourceProperty?: string | undefined;
  denominatorPropertyFilter?: unknown | undefined;
  denominatorOutlierLimitMethod?: string | undefined;
  denominatorRetentionTime?: string | undefined;
  denominatorRetentionTimeReference?: string | undefined;
  denominatorActivityInterval?: string | undefined;
  denominatorCustomSql?: string | undefined;
  denominatorCustomStatisticsType?: string | undefined;
  denominatorVrLookbackInterval?: string | undefined;
  denominatorRelationKind?: string | undefined;
  denominatorRelationRefundOperation?: string | undefined;
  denominatorRelationForeignDuplicateOperation?: string | undefined;

  ratioCondition?: string | undefined;
}

export function buildMetricPayload(fields: MetricFields): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined) data[key] = value;
  };

  set('name', fields.name);
  set('type', fields.type);
  set('description', fields.description);
  set('effect', fields.effect);
  set('goal_id', fields.goalId);
  if (fields.owner !== undefined) data.owners = [{ user_id: fields.owner }];

  set('format_str', fields.formatStr);
  set('scale', fields.scale);
  set('precision', fields.precision);
  set('mean_format_str', fields.meanFormatStr);
  set('mean_scale', fields.meanScale);
  set('mean_precision', fields.meanPrecision);

  set('outlier_limit_method', fields.outlierLimitMethod);
  set('value_source_property', fields.valueSourceProperty);
  set('property_filter', fields.propertyFilter);

  set('retention_time', fields.retentionTime);
  set('retention_time_reference', fields.retentionTimeReference);
  set('activity_interval', fields.activityInterval);
  set('custom_sql', fields.customSql);
  set('custom_statistics_type', fields.customStatisticsType);
  set('datasource_id', fields.datasourceId);
  set('vr_lookback_interval', fields.vrLookbackInterval);
  set('relation_kind', fields.relationKind);
  set('relation_refund_operation', fields.relationRefundOperation);
  set('relation_foreign_duplicate_operation', fields.relationForeignDuplicateOperation);

  set('numerator_type', fields.numeratorType);
  set('denominator_type', fields.denominatorType);
  set('denominator_goal_id', fields.denominatorGoalId);
  set('denominator_value_source_property', fields.denominatorValueSourceProperty);
  set('denominator_property_filter', fields.denominatorPropertyFilter);
  set('denominator_outlier_limit_method', fields.denominatorOutlierLimitMethod);
  set('denominator_retention_time', fields.denominatorRetentionTime);
  set('denominator_retention_time_reference', fields.denominatorRetentionTimeReference);
  set('denominator_activity_interval', fields.denominatorActivityInterval);
  set('denominator_custom_sql', fields.denominatorCustomSql);
  set('denominator_custom_statistics_type', fields.denominatorCustomStatisticsType);
  set('denominator_vr_lookback_interval', fields.denominatorVrLookbackInterval);
  set('denominator_relation_kind', fields.denominatorRelationKind);
  set('denominator_relation_refund_operation', fields.denominatorRelationRefundOperation);
  set(
    'denominator_relation_foreign_duplicate_operation',
    fields.denominatorRelationForeignDuplicateOperation
  );

  set('ratio_condition', fields.ratioCondition);

  // The backend's chk_goal_ratio DB CHECK constraint requires
  // denominator_value_source_property to be NOT NULL for every goal_ratio row.
  // The column is nullable with no DB default, so a payload that omits the
  // field produces a 500 at insert time. Default it to "" here (mirroring the
  // backend-side fix in office/backend/src/routes/metrics/index.ts
  // prepareDraftData) so users aren't forced to pass --denominator-value-source-property
  // for every goal_ratio metric.
  if (fields.type === 'goal_ratio' && !('denominator_value_source_property' in data)) {
    data.denominator_value_source_property = '';
  }

  return data;
}

// Mirrors backend metricTypeSpecificRequiredFields / denominatorTypeSpecificRequiredFields
// in ~/abs/office/backend/src/routes/metrics/index.ts. Keep these in sync when the
// backend changes.
const typeRequiredFields: Record<string, readonly (keyof MetricFields)[]> = {
  goal_count: ['goalId'],
  goal_unique_count: ['goalId'],
  goal_time_to_achievement: ['goalId'],
  goal_property: ['valueSourceProperty', 'goalId'],
  goal_property_unique_count: ['valueSourceProperty', 'goalId'],
  goal_retention: ['retentionTime', 'retentionTimeReference', 'goalId'],
  goal_activity_period_count: ['goalId', 'activityInterval'],
  custom_sql: ['customSql', 'customStatisticsType'],
  goal_ratio: ['numeratorType', 'denominatorType', 'denominatorOutlierLimitMethod'],
};

const denominatorTypeRequiredFields: Record<string, readonly (keyof MetricFields)[]> = {
  goal_count: ['denominatorGoalId'],
  goal_unique_count: ['denominatorGoalId'],
  goal_time_to_achievement: ['denominatorGoalId'],
  goal_property: ['denominatorValueSourceProperty', 'denominatorGoalId'],
  goal_property_unique_count: ['denominatorValueSourceProperty', 'denominatorGoalId'],
  goal_retention: [
    'denominatorRetentionTime',
    'denominatorRetentionTimeReference',
    'denominatorGoalId',
  ],
  goal_activity_period_count: ['denominatorGoalId', 'denominatorActivityInterval'],
  custom_sql: ['denominatorCustomSql', 'denominatorCustomStatisticsType'],
};

const fieldToFlag: Partial<Record<keyof MetricFields, string>> = {
  goalId: '--goal',
  valueSourceProperty: '--value-source-property',
  retentionTime: '--retention-time',
  retentionTimeReference: '--retention-time-reference',
  activityInterval: '--activity-interval',
  customSql: '--custom-sql',
  customStatisticsType: '--custom-statistics-type',
  numeratorType: '--numerator-type',
  denominatorType: '--denominator-type',
  denominatorOutlierLimitMethod: '--denominator-outlier-limit-method',
  denominatorGoalId: '--denominator-goal',
  denominatorValueSourceProperty: '--denominator-value-source-property',
  denominatorRetentionTime: '--denominator-retention-time',
  denominatorRetentionTimeReference: '--denominator-retention-time-reference',
  denominatorActivityInterval: '--denominator-activity-interval',
  denominatorCustomSql: '--denominator-custom-sql',
  denominatorCustomStatisticsType: '--denominator-custom-statistics-type',
};

function flagFor(field: keyof MetricFields): string {
  return (
    fieldToFlag[field] ??
    `--${String(field)
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()}`
  );
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

export interface ValidateOptions {
  /**
   * - `strict`: validate as if submitting a fresh create — all required fields must
   *   be present on `fields`.
   * - `loose`: validate only when `type`, `numerator_type`, or `denominator_type` is
   *   being explicitly set (e.g. on `metric version`). If none of those is set,
   *   returns without error so inherited values from the existing version can fill
   *   in the rest server-side.
   */
  mode: 'strict' | 'loose';
}

export function validateMetricFields(fields: MetricFields, options: ValidateOptions): void {
  const changingTypeShape =
    fields.type !== undefined ||
    fields.numeratorType !== undefined ||
    fields.denominatorType !== undefined;

  if (options.mode === 'loose' && !changingTypeShape) return;

  const errors: string[] = [];

  if (fields.type !== undefined && !(fields.type in typeRequiredFields)) {
    errors.push(
      `Unknown metric --type '${fields.type}'. Must be one of: ${Object.keys(typeRequiredFields).join(', ')}.`
    );
  }

  if (fields.type !== undefined) {
    const required = typeRequiredFields[fields.type] ?? [];
    for (const field of required) {
      if (isMissing(fields[field])) {
        errors.push(`${flagFor(field)} is required when --type is ${fields.type}.`);
      }
    }
  }

  if (fields.type === 'goal_ratio' || fields.numeratorType !== undefined) {
    const effectiveNumerator = fields.numeratorType;
    if (effectiveNumerator !== undefined && !(effectiveNumerator in typeRequiredFields)) {
      errors.push(
        `Unknown --numerator-type '${effectiveNumerator}'. Must be one of: ${Object.keys(typeRequiredFields).join(', ')}.`
      );
    }
    if (effectiveNumerator !== undefined) {
      const required = typeRequiredFields[effectiveNumerator] ?? [];
      for (const field of required) {
        // Skip self-referencing required fields (e.g. goal_ratio's numerator_type requirement).
        if (field === 'numeratorType' || field === 'denominatorType') continue;
        if (isMissing(fields[field])) {
          errors.push(
            `${flagFor(field)} is required when --numerator-type is ${effectiveNumerator}.`
          );
        }
      }
    }
  }

  if (fields.type === 'goal_ratio' || fields.denominatorType !== undefined) {
    const denomType = fields.denominatorType;
    if (denomType !== undefined && !(denomType in denominatorTypeRequiredFields)) {
      errors.push(
        `Unknown --denominator-type '${denomType}'. Must be one of: ${Object.keys(denominatorTypeRequiredFields).join(', ')}.`
      );
    }
    if (denomType !== undefined) {
      const required = denominatorTypeRequiredFields[denomType] ?? [];
      for (const field of required) {
        if (isMissing(fields[field])) {
          errors.push(`${flagFor(field)} is required when --denominator-type is ${denomType}.`);
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      errors.length === 1
        ? errors[0]!
        : `Metric payload is missing required fields:\n  - ${errors.join('\n  - ')}`
    );
  }
}
