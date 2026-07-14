import type { paths, components } from 'absmartly-api-mocks/src/generated/schema';

export type ExperimentsListResponse =
  paths['/experiments']['get']['responses']['200']['content']['application/json'];
export type ExperimentDetailResponse =
  paths['/experiments/{experimentId}']['get']['responses']['200']['content']['application/json'];
export type ExperimentCreateRequest =
  paths['/experiments']['post']['requestBody']['content']['application/json'];
export type ExperimentUpdateRequest =
  paths['/experiments/{experimentId}']['put']['requestBody']['content']['application/json'];

export type GoalsListResponse =
  paths['/goals']['get']['responses']['200']['content']['application/json'];
export type GoalDetailResponse =
  paths['/goals/{goalId}']['get']['responses']['200']['content']['application/json'];

export type SegmentsListResponse =
  paths['/segments']['get']['responses']['200']['content']['application/json'];
export type SegmentDetailResponse =
  paths['/segments/{segmentId}']['get']['responses']['200']['content']['application/json'];

export type TeamsListResponse =
  paths['/teams']['get']['responses']['200']['content']['application/json'];
export type TeamDetailResponse =
  paths['/teams/{teamId}']['get']['responses']['200']['content']['application/json'];

export type UsersListResponse =
  paths['/users']['get']['responses']['200']['content']['application/json'];
export type UserDetailResponse =
  paths['/users/{userId}']['get']['responses']['200']['content']['application/json'];

export type MetricsListResponse =
  paths['/metrics']['get']['responses']['200']['content']['application/json'];
export type MetricDetailResponse =
  paths['/metrics/{metricId}']['get']['responses']['200']['content']['application/json'];

export type Experiment = components['schemas']['Experiment'];
export type ExperimentShort = components['schemas']['ExperimentShort'];
export type ExperimentVariant = components['schemas']['ExperimentVariant'];
export type ExperimentNote = components['schemas']['ExperimentNote'];
export type ExperimentTag = components['schemas']['ExperimentTag'];
export type Goal = components['schemas']['Goal'];
export type GoalTag = components['schemas']['GoalTag'];
export type Segment = components['schemas']['Segment'];
export type Team = components['schemas']['Team'];
export type User = components['schemas']['User'];
export type UpdateUserData = components['schemas']['UpdateUserBody']['data'];
export type Metric = components['schemas']['Metric'];
export type MetricTag = components['schemas']['MetricTag'];
export type MetricCategory = components['schemas']['MetricCategory'];
export type Application = components['schemas']['Application'];
export type Environment = components['schemas']['Environment'];
export type UnitType = components['schemas']['UnitType'];
export type ApiKey = components['schemas']['ApiKey'];
export type Role = components['schemas']['Role'];
export type Permission = components['schemas']['Permission'];
export type Webhook = components['schemas']['Webhook'];

export type FileUpload = components['schemas']['FileUpload'];
export type FileUploadInput = components['schemas']['FileUploadInput'];
export type FileUploadDetails = components['schemas']['FileUploadDetails'];
export type VariantScreenshotInput = components['schemas']['VariantScreenshotInput'];
export type VariantScreenshotDetails = components['schemas']['VariantScreenshotDetails'];

export type { paths, components };
