import * as R from 'ramda';
import { version as uuidVersion } from 'uuid';
import { isEmptyField, isInferredIndex } from './utils';
import { FunctionalError, UnsupportedError } from '../config/errors';
import { isStixObject } from '../schema/stixCoreObject';
import { isStixRelationship } from '../schema/stixRelationship';
import {
  INPUT_BCC,
  INPUT_BELONGS_TO,
  INPUT_BODY_MULTIPART,
  INPUT_BODY_RAW,
  INPUT_CC,
  INPUT_CHILD,
  INPUT_CONTAINS,
  INPUT_CONTENT,
  INPUT_CREATOR_USER,
  INPUT_DST,
  INPUT_DST_PAYLOAD,
  INPUT_ENCAPSULATED_BY,
  INPUT_ENCAPSULATES,
  INPUT_FROM,
  INPUT_IMAGE, INPUT_LINKED,
  INPUT_OPENED_CONNECTION, INPUT_OPERATING_SYSTEM,
  INPUT_PARENT,
  INPUT_PARENT_DIRECTORY,
  INPUT_RAW_EMAIL,
  INPUT_RESOLVES_TO, INPUT_SAMPLE,
  INPUT_SENDER,
  INPUT_SRC,
  INPUT_SRC_PAYLOAD,
  INPUT_TO,
  INPUT_VALUES,
  isStixCyberObservableRelationship
} from '../schema/stixCyberObservableRelationship';
import {
  ENTITY_TYPE_EXTERNAL_REFERENCE,
  ENTITY_TYPE_KILL_CHAIN_PHASE,
  ENTITY_TYPE_LABEL,
  ENTITY_TYPE_MARKING_DEFINITION,
  isStixMetaObject
} from '../schema/stixMetaObject';
import type * as S from '../types/stix-common';
import type * as SDO from '../types/stix-sdo';
import type * as SRO from '../types/stix-sro';
import type * as SCO from '../types/stix-sco';
import type * as SMO from '../types/stix-smo';
import type {
  BasicStoreCommon,
  StoreBase,
  StoreCyberObservable,
  StoreEntity,
  StoreObject,
  StoreRelation,
} from '../types/store';
import {
  ENTITY_TYPE_ATTACK_PATTERN,
  ENTITY_TYPE_CAMPAIGN,
  ENTITY_TYPE_CONTAINER_NOTE,
  ENTITY_TYPE_CONTAINER_OBSERVED_DATA,
  ENTITY_TYPE_CONTAINER_OPINION,
  ENTITY_TYPE_CONTAINER_REPORT,
  ENTITY_TYPE_COURSE_OF_ACTION,
  ENTITY_TYPE_INCIDENT,
  ENTITY_TYPE_INDICATOR,
  ENTITY_TYPE_INFRASTRUCTURE,
  ENTITY_TYPE_INTRUSION_SET,
  ENTITY_TYPE_MALWARE,
  ENTITY_TYPE_THREAT_ACTOR,
  ENTITY_TYPE_TOOL,
  ENTITY_TYPE_VULNERABILITY,
  isStixDomainObject,
  isStixDomainObjectIdentity,
  isStixDomainObjectLocation
} from '../schema/stixDomainObject';
import { isStixCoreRelationship } from '../schema/stixCoreRelationship';
import { isStixSightingRelationship } from '../schema/stixSightingRelationship';
import {
  ENTITY_AUTONOMOUS_SYSTEM,
  ENTITY_CRYPTOGRAPHIC_KEY,
  ENTITY_CRYPTOGRAPHIC_WALLET,
  ENTITY_DIRECTORY,
  ENTITY_DOMAIN_NAME,
  ENTITY_EMAIL_ADDR,
  ENTITY_EMAIL_MESSAGE,
  ENTITY_EMAIL_MIME_PART_TYPE,
  ENTITY_HASHED_OBSERVABLE_ARTIFACT,
  ENTITY_HASHED_OBSERVABLE_STIX_FILE,
  ENTITY_HASHED_OBSERVABLE_X509_CERTIFICATE,
  ENTITY_HOSTNAME,
  ENTITY_IPV4_ADDR,
  ENTITY_IPV6_ADDR,
  ENTITY_MAC_ADDR,
  ENTITY_MUTEX,
  ENTITY_NETWORK_TRAFFIC,
  ENTITY_PROCESS,
  ENTITY_SOFTWARE,
  ENTITY_TEXT,
  ENTITY_URL,
  ENTITY_USER_ACCOUNT,
  ENTITY_WINDOWS_REGISTRY_KEY,
  ENTITY_WINDOWS_REGISTRY_VALUE_TYPE,
  isStixCyberObservable
} from '../schema/stixCyberObservable';
import { STIX_EXT_MITRE, STIX_EXT_OCTI, STIX_EXT_OCTI_SCO } from '../types/stix-extensions';
import {
  INPUT_CREATED_BY,
  INPUT_EXTERNAL_REFS,
  INPUT_KILLCHAIN,
  INPUT_LABELS,
  INPUT_MARKINGS,
  INPUT_OBJECTS
} from '../schema/general';
import { isStixMetaRelationship } from '../schema/stixMetaRelationship';

export const isTrustedStixId = (stixId: string): boolean => {
  const segments = stixId.split('--');
  const [, uuid] = segments;
  return uuidVersion(uuid) !== 1;
};
export const convertTypeToStixType = (type: string): string => {
  if (isStixDomainObjectIdentity(type)) {
    return 'identity';
  }
  if (isStixDomainObjectLocation(type)) {
    return 'location';
  }
  if (type === ENTITY_HASHED_OBSERVABLE_STIX_FILE) {
    return 'file';
  }
  if (isStixCoreRelationship(type)) {
    return 'relationship';
  }
  if (isStixSightingRelationship(type)) {
    return 'sighting';
  }
  return type.toLowerCase();
};
const assertType = (type: string, instanceType: string) => {
  if (instanceType !== type) {
    throw UnsupportedError(`${instanceType} not compatible with ${type}`);
  }
};
const isValidStix = (data: S.StixObject): boolean => {
  // TODO @JRI @SAM
  return !R.isEmpty(data);
};
const cleanObject = <T>(data: T): T => {
  const obj: T = { ...data };
  // eslint-disable-next-line no-restricted-syntax
  for (const key in data) {
    if (isEmptyField(obj[key])) {
      delete obj[key];
    } else if (key === 'extensions') {
      // Extensions can be generated with only the extension_type
      // If it's the case, no need to keep the extension
      const extensionDefinitions = Object.entries(obj[key]);
      for (let i = 0; i < extensionDefinitions.length; i += 1) {
        const [extKey, extObject] = extensionDefinitions[i];
        if (Object.entries(extObject).length === 1) {
          const ext = obj[key] as any;
          delete ext[extKey];
        }
      }
    }
  }
  return obj;
};

// Extensions
const buildOCTIExtensions = (instance: StoreBase): S.StixOpenctiExtension => {
  const octiExtensions: S.StixOpenctiExtension = {
    extension_type: 'property-extension',
    id: instance.internal_id,
    type: instance.entity_type,
    created_at: instance.created_at,
    updated_at: instance.updated_at,
    aliases: instance.x_opencti_aliases ?? [],
    files: (instance.x_opencti_files ?? []).map((file) => ({
      name: file.name,
      uri: `/storage/get/${file.id}`,
      version: file.version,
      mime_type: file.mime_type,
    })),
    stix_ids: (instance.x_opencti_stix_ids ?? []).filter((stixId: string) => isTrustedStixId(stixId)),
    is_inferred: instance._index ? isInferredIndex(instance._index) : undefined,
    workflow_id: instance.x_opencti_workflow_id,
  };
  return cleanObject(octiExtensions);
};
const buildMITREExtensions = (instance: StoreEntity): S.StixMitreExtension => {
  const mitreExtensions: S.StixMitreExtension = {
    extension_type: 'property-extension',
    id: instance.x_mitre_id,
    detection: instance.x_mitre_detection,
    permissions_required: instance.x_mitre_permissions_required,
    platforms: instance.x_mitre_platforms,
  };
  return cleanObject(mitreExtensions);
};

// Builders
const buildStixObject = (instance: BasicStoreCommon): S.StixObject => {
  return {
    id: instance.standard_id,
    spec_version: '2.1',
    type: convertTypeToStixType(instance.entity_type),
    extensions: {
      [STIX_EXT_OCTI]: buildOCTIExtensions(instance),
    }
  };
};

// Meta
const buildKillChainPhases = (instance: StoreEntity | StoreRelation): Array<SMO.StixInternalKillChainPhase> => {
  return (instance[INPUT_KILLCHAIN] ?? []).map((k) => {
    const data: SMO.StixInternalKillChainPhase = {
      kill_chain_name: k.kill_chain_name,
      phase_name: k.phase_name,
    };
    return cleanObject(data);
  });
};
const buildExternalReferences = (instance: StoreObject): Array<SMO.StixInternalExternalReference> => {
  return (instance[INPUT_EXTERNAL_REFS] ?? []).map((e) => {
    const data: SMO.StixInternalExternalReference = {
      source_name: e.source_name,
      description: e.description,
      url: e.url,
      hashes: e.hashes,
      external_id: e.external_id,
    };
    return cleanObject(data);
  });
};
const buildWindowsRegistryValueType = (instance: StoreCyberObservable): Array<SCO.StixInternalWindowsRegistryValueType> => {
  return (instance[INPUT_VALUES] ?? []).map((k) => {
    const data: SCO.StixInternalWindowsRegistryValueType = {
      name: k.name,
      data: k.data,
      data_type: k.data_type,
    };
    return cleanObject(data);
  });
};
const buildEmailBodyMultipart = (instance: StoreCyberObservable): Array<SCO.StixInternalEmailBodyMultipart> => {
  return (instance[INPUT_BODY_MULTIPART] ?? []).map((k) => {
    const data: SCO.StixInternalEmailBodyMultipart = {
      content_type: k.content_type,
      content_disposition: k.content_disposition,
      body: k.body,
      body_raw_ref: instance[INPUT_BODY_RAW]?.standard_id,
    };
    return cleanObject(data);
  });
};

// General
const buildStixDomain = (instance: StoreEntity | StoreRelation): S.StixDomainObject => {
  return {
    ...buildStixObject(instance),
    created: instance.created,
    modified: instance.modified,
    revoked: instance.revoked,
    confidence: instance.confidence,
    lang: instance.lang,
    labels: (instance[INPUT_LABELS] ?? []).map((m) => m.value),
    object_marking_refs: (instance[INPUT_MARKINGS] ?? []).map((m) => m.standard_id),
    created_by_ref: instance[INPUT_CREATED_BY]?.standard_id,
    external_references: buildExternalReferences(instance),
  };
};
const buildStixRelationship = (instance: StoreRelation): S.StixRelationshipObject => {
  // As 14/03/2022, relationship share same common information with domain
  return buildStixDomain(instance);
};
const buildStixMarkings = (instance: StoreEntity): S.StixMarkingsObject => {
  return {
    ...buildStixObject(instance),
    created_by_ref: instance[INPUT_CREATED_BY]?.standard_id,
    created: instance.created,
    modified: instance.updated_at,
    external_references: buildExternalReferences(instance),
    object_marking_refs: (instance[INPUT_MARKINGS] ?? []).map((m) => m.standard_id),
  };
};
const buildStixCyberObservable = (instance: StoreCyberObservable): S.StixCyberObject => {
  const stixObject = buildStixObject(instance);
  return {
    ...stixObject,
    defanged: instance.defanged,
    object_marking_refs: (instance[INPUT_MARKINGS] ?? []).map((m) => m.standard_id),
    extensions: {
      [STIX_EXT_OCTI]: stixObject.extensions[STIX_EXT_OCTI],
      [STIX_EXT_OCTI_SCO]: cleanObject({
        extension_type: 'property-extension',
        labels: (instance[INPUT_LABELS] ?? []).map((m) => m.value),
        description: instance.x_opencti_description,
        score: instance.x_opencti_score,
        created_by_ref: instance[INPUT_CREATED_BY]?.standard_id,
        linked_to_refs: (instance[INPUT_LINKED] ?? []).map((m) => m.standard_id),
        external_references: buildExternalReferences(instance)
      })
    }
  };
};

// SDO
const convertIdentityToStix = (instance: StoreEntity, type: string): SDO.StixIdentity => {
  if (!isStixDomainObjectIdentity(type)) {
    throw UnsupportedError(`${instance.entity_type} not compatible with identity`);
  }
  const identity = buildStixDomain(instance);
  return {
    ...identity,
    name: instance.name,
    description: instance.description,
    contact_information: instance.contact_information,
    identity_class: instance.identity_class,
    roles: instance.roles,
    sectors: instance.sectors,
    extensions: {
      [STIX_EXT_OCTI]: cleanObject({
        ...identity.extensions[STIX_EXT_OCTI],
        firstname: instance.x_opencti_firstname,
        lastname: instance.x_opencti_lastname,
        organization_type: instance.x_opencti_organization_type,
        reliability: instance.x_opencti_reliability
      })
    }
  };
};
const convertLocationToStix = (instance: StoreEntity, type: string): SDO.StixLocation => {
  if (!isStixDomainObjectLocation(type)) {
    throw UnsupportedError(`${instance.entity_type} not compatible with location`);
  }
  return {
    ...buildStixDomain(instance),
    name: instance.name,
    description: instance.description,
    latitude: instance.latitude,
    longitude: instance.longitude,
    precision: instance.precision,
    region: instance.region,
    country: instance.country,
    administrative_area: instance.administrative_area,
    city: instance.city,
    street_address: instance.street_address,
    postal_code: instance.postal_code,
  };
};
const convertIncidentToStix = (instance: StoreEntity, type: string): SDO.StixIncident => {
  assertType(ENTITY_TYPE_INCIDENT, type);
  const incident = buildStixDomain(instance);
  return {
    ...incident,
    name: instance.name,
    description: instance.description,
    first_seen: instance.first_seen,
    last_seen: instance.last_seen,
    aliases: instance.aliases,
    objective: instance.objective,
    extensions: {
      [STIX_EXT_OCTI]: {
        ...incident.extensions[STIX_EXT_OCTI],
        extension_type: 'new-sdo',
      }
    }
  };
};
const convertCampaignToStix = (instance: StoreEntity, type: string): SDO.StixCampaign => {
  assertType(ENTITY_TYPE_CAMPAIGN, type);
  return {
    ...buildStixDomain(instance),
    name: instance.name,
    description: instance.description,
    aliases: instance.aliases,
    first_seen: instance.first_seen,
    last_seen: instance.last_seen,
    objective: instance.objective,
  };
};
const convertToolToStix = (instance: StoreEntity, type: string): SDO.StixTool => {
  assertType(ENTITY_TYPE_TOOL, type);
  return {
    ...buildStixDomain(instance),
    name: instance.name,
    description: instance.description,
    tool_types: instance.tool_types,
    aliases: instance.aliases,
    kill_chain_phases: buildKillChainPhases(instance),
    tool_version: instance.tool_version
  };
};
const convertVulnerabilityToStix = (instance: StoreEntity, type: string): SDO.StixVulnerability => {
  assertType(ENTITY_TYPE_VULNERABILITY, type);
  const vulnerability = buildStixDomain(instance);
  return {
    ...vulnerability,
    name: instance.name,
    description: instance.description,
    extensions: {
      [STIX_EXT_OCTI]: cleanObject({
        ...vulnerability.extensions[STIX_EXT_OCTI],
        attack_vector: instance.x_opencti_attack_vector,
        availability_impact: instance.x_opencti_availability_impact,
        base_score: instance.x_opencti_base_score,
        base_severity: instance.x_opencti_base_severity,
        confidentiality_impact: instance.x_opencti_confidentiality_impact,
        integrity_impact: instance.x_opencti_integrity_impact,
      })
    }
  };
};
const convertThreatActorToStix = (instance: StoreEntity, type: string): SDO.StixThreatActor => {
  assertType(ENTITY_TYPE_THREAT_ACTOR, type);
  return {
    ...buildStixDomain(instance),
    name: instance.name,
    description: instance.description,
    threat_actor_types: instance.threat_actor_types,
    aliases: instance.aliases,
    first_seen: instance.first_seen,
    last_seen: instance.last_seen,
    roles: instance.roles,
    goals: instance.goals,
    sophistication: instance.sophistication,
    resource_level: instance.resource_level,
    primary_motivation: instance.primary_motivation,
    secondary_motivations: instance.secondary_motivations,
    personal_motivations: instance.personal_motivations,
  };
};
const convertInfrastructureToStix = (instance: StoreEntity, type: string): SDO.StixInfrastructure => {
  assertType(ENTITY_TYPE_INFRASTRUCTURE, type);
  return {
    ...buildStixDomain(instance),
    name: instance.name,
    description: instance.description,
    infrastructure_types: instance.infrastructure_types,
    aliases: instance.aliases,
    kill_chain_phases: buildKillChainPhases(instance),
    first_seen: instance.first_seen,
    last_seen: instance.last_seen,
  };
};
const convertIntrusionSetToStix = (instance: StoreEntity, type: string): SDO.StixIntrusionSet => {
  assertType(ENTITY_TYPE_INTRUSION_SET, type);
  return {
    ...buildStixDomain(instance),
    name: instance.name,
    description: instance.description,
    aliases: instance.aliases,
    first_seen: instance.first_seen,
    last_seen: instance.last_seen,
    goals: instance.goals,
    resource_level: instance.resource_level,
    primary_motivation: instance.primary_motivation,
    secondary_motivations: instance.secondary_motivations
  };
};
const convertIndicatorToStix = (instance: StoreEntity, type: string): SDO.StixIndicator => {
  assertType(ENTITY_TYPE_INDICATOR, type);
  const indicator = buildStixDomain(instance);
  return {
    ...indicator,
    name: instance.name,
    description: instance.description,
    indicator_types: instance.indicator_types,
    pattern: instance.pattern,
    pattern_type: instance.pattern_type,
    pattern_version: instance.pattern_version,
    valid_from: instance.valid_from,
    valid_until: instance.valid_until,
    kill_chain_phases: buildKillChainPhases(instance),
    extensions: {
      [STIX_EXT_OCTI]: cleanObject({
        ...indicator.extensions[STIX_EXT_OCTI],
        detection: instance.x_opencti_detection,
        score: instance.x_opencti_score,
        main_observable_type: instance.x_opencti_main_observable_type
      }),
      [STIX_EXT_MITRE]: buildMITREExtensions(instance)
    }
  };
};
const convertCourseOfActionToStix = (instance: StoreEntity, type: string): SDO.StixCourseOfAction => {
  assertType(ENTITY_TYPE_COURSE_OF_ACTION, type);
  const domain = buildStixDomain(instance);
  return {
    ...domain,
    name: instance.name,
    description: instance.description,
    extensions: {
      [STIX_EXT_OCTI]: buildOCTIExtensions(instance),
      [STIX_EXT_MITRE]: buildMITREExtensions(instance)
    }
  };
};
const convertMalwareToStix = (instance: StoreEntity, type: string): SDO.StixMalware => {
  assertType(ENTITY_TYPE_MALWARE, type);
  return {
    ...buildStixDomain(instance),
    name: instance.name,
    description: instance.description,
    malware_types: instance.malware_types,
    is_family: instance.is_family,
    aliases: instance.aliases,
    kill_chain_phases: buildKillChainPhases(instance),
    first_seen: instance.first_seen,
    last_seen: instance.last_seen,
    architecture_execution_envs: instance.architecture_execution_envs,
    implementation_languages: instance.implementation_languages,
    capabilities: instance.capabilities,
    operating_system_refs: (instance[INPUT_OPERATING_SYSTEM] ?? []).map((m) => m.standard_id),
    sample_refs: (instance[INPUT_SAMPLE] ?? []).map((m) => m.standard_id),
  };
};
const convertAttackPatternToStix = (instance: StoreEntity, type: string): SDO.StixAttackPattern => {
  assertType(ENTITY_TYPE_ATTACK_PATTERN, type);
  const stixDomainObject = buildStixDomain(instance);
  return {
    ...stixDomainObject,
    name: instance.name,
    description: instance.description,
    aliases: instance.aliases,
    kill_chain_phases: buildKillChainPhases(instance),
    extensions: {
      [STIX_EXT_OCTI]: buildOCTIExtensions(instance),
      [STIX_EXT_MITRE]: buildMITREExtensions(instance)
    }
  };
};
const convertReportToStix = (instance: StoreEntity, type: string): SDO.StixReport => {
  assertType(ENTITY_TYPE_CONTAINER_REPORT, type);
  return {
    ...buildStixDomain(instance),
    name: instance.name,
    description: instance.description,
    report_types: instance.report_types,
    published: instance.published,
    object_refs: (instance[INPUT_OBJECTS] ?? []).map((m) => m.standard_id)
  };
};
const convertNoteToStix = (instance: StoreEntity, type: string): SDO.StixNote => {
  assertType(ENTITY_TYPE_CONTAINER_NOTE, type);
  return {
    ...buildStixDomain(instance),
    abstract: instance.attribute_abstract,
    content: instance.content,
    authors: instance.authors,
    object_refs: (instance[INPUT_OBJECTS] ?? []).map((m) => m.standard_id)
  };
};
const convertObservedDateToStix = (instance: StoreEntity, type: string): SDO.StixObservedData => {
  assertType(ENTITY_TYPE_CONTAINER_OBSERVED_DATA, type);
  return {
    ...buildStixDomain(instance),
    first_observed: instance.first_observed,
    last_observed: instance.last_observed,
    number_observed: instance.number_observed,
    object_refs: (instance.objects ?? []).map((m) => m.standard_id)
  };
};
const convertOpinionToStix = (instance: StoreEntity, type: string): SDO.StixOpinion => {
  assertType(ENTITY_TYPE_CONTAINER_OPINION, type);
  return {
    ...buildStixDomain(instance),
    explanation: instance.explanation,
    authors: instance.authors,
    opinion: instance.opinion,
    object_refs: (instance.objects ?? []).map((m) => m.standard_id)
  };
};

// SCO
const convertArtifactToStix = (instance: StoreCyberObservable, type: string): SCO.StixArtifact => {
  assertType(ENTITY_HASHED_OBSERVABLE_ARTIFACT, type);
  const stixCyberObject = buildStixCyberObservable(instance);
  return {
    ...stixCyberObject,
    mime_type: instance.mime_type,
    payload_bin: instance.payload_bin,
    url: instance.url,
    hashes: instance.hashes ?? {}, // TODO JRI Find a way to make that mandatory
    encryption_algorithm: instance.encryption_algorithm,
    decryption_key: instance.decryption_key,
    extensions: {
      ...stixCyberObject.extensions,
      [STIX_EXT_OCTI_SCO]: cleanObject({
        ...stixCyberObject.extensions[STIX_EXT_OCTI_SCO],
        additional_names: instance.x_opencti_additional_names,
      })
    }
  };
};
const convertAutonomousSystemToStix = (instance: StoreCyberObservable, type: string): SCO.StixAutonomousSystem => {
  assertType(ENTITY_AUTONOMOUS_SYSTEM, type);
  return {
    ...buildStixCyberObservable(instance),
    number: instance.number,
    name: instance.name,
    rir: instance.rir,
  };
};
const convertCryptocurrencyWalletToStix = (instance: StoreCyberObservable, type: string): SCO.StixCryptocurrencyWallet => {
  assertType(ENTITY_CRYPTOGRAPHIC_WALLET, type);
  const stixCyberObject = buildStixCyberObservable(instance);
  return {
    ...stixCyberObject,
    value: instance.value,
    labels: (instance[INPUT_LABELS] ?? []).map((m) => m.value),
    description: instance.x_opencti_description,
    score: instance.x_opencti_score,
    created_by_ref: instance[INPUT_CREATED_BY]?.standard_id,
    external_references: buildExternalReferences(instance),
    extensions: {
      ...stixCyberObject.extensions,
      [STIX_EXT_OCTI_SCO]: { extension_type: 'new-sco' }
    }
  };
};
const convertCryptographicKeyToStix = (instance: StoreCyberObservable, type: string): SCO.StixCryptographicKey => {
  assertType(ENTITY_CRYPTOGRAPHIC_KEY, type);
  const stixCyberObject = buildStixCyberObservable(instance);
  return {
    ...stixCyberObject,
    value: instance.value,
    labels: (instance[INPUT_LABELS] ?? []).map((m) => m.value),
    description: instance.x_opencti_description,
    score: instance.x_opencti_score,
    created_by_ref: instance[INPUT_CREATED_BY]?.standard_id,
    external_references: buildExternalReferences(instance),
    extensions: {
      ...stixCyberObject.extensions,
      [STIX_EXT_OCTI_SCO]: { extension_type: 'new-sco' }
    }
  };
};
const convertDirectoryToStix = (instance: StoreCyberObservable, type: string): SCO.StixDirectory => {
  assertType(ENTITY_DIRECTORY, type);
  return {
    ...buildStixCyberObservable(instance),
    path: instance.path,
    path_enc: instance.path_enc,
    ctime: instance.ctime,
    mtime: instance.mtime,
    atime: instance.atime,
    contains_refs: (instance[INPUT_CONTAINS] ?? []).map((m) => m.standard_id)
  };
};
const convertDomainNameToStix = (instance: StoreCyberObservable, type: string): SCO.StixDomainName => {
  assertType(ENTITY_DOMAIN_NAME, type);
  return {
    ...buildStixCyberObservable(instance),
    value: instance.value,
    resolves_to_refs: (instance[INPUT_RESOLVES_TO] ?? []).map((m) => m.standard_id)
  };
};
const convertEmailAddressToStix = (instance: StoreCyberObservable, type: string): SCO.StixEmailAddress => {
  assertType(ENTITY_EMAIL_ADDR, type);
  return {
    ...buildStixCyberObservable(instance),
    value: instance.value,
    display_name: instance.display_name,
    belongs_to_ref: (instance[INPUT_BELONGS_TO] ?? [])[0]?.standard_id // TODO WHAT???
  };
};
const convertEmailMessageToStix = (instance: StoreCyberObservable, type: string): SCO.StixEmailMessage => {
  assertType(ENTITY_EMAIL_MESSAGE, type);
  return {
    ...buildStixCyberObservable(instance),
    is_multipart: instance.is_multipart,
    date: instance.attribute_date,
    content_type: instance.content_type,
    from_ref: instance[INPUT_FROM]?.standard_id,
    sender_ref: instance[INPUT_SENDER]?.standard_id,
    to_refs: (instance[INPUT_TO] ?? []).map((m) => m.standard_id),
    cc_refs: (instance[INPUT_CC] ?? []).map((m) => m.standard_id),
    bcc_refs: (instance[INPUT_BCC] ?? []).map((m) => m.standard_id),
    message_id: instance.message_id,
    subject: instance.subject,
    received_lines: instance.received_lines,
    additional_header_fields: {}, // TODO Implement
    body: instance.body,
    body_multipart: buildEmailBodyMultipart(instance),
    raw_email_ref: instance[INPUT_RAW_EMAIL]?.standard_id
  };
};
const convertFileToStix = (instance: StoreCyberObservable, type: string): SCO.StixFile => {
  assertType(ENTITY_HASHED_OBSERVABLE_STIX_FILE, type);
  const stixCyberObject = buildStixCyberObservable(instance);
  return {
    ...stixCyberObject,
    hashes: instance.hashes ?? {}, // TODO JRI Find a way to make that mandatory
    size: instance.size,
    name: instance.name,
    name_enc: instance.name_enc,
    magic_number_hex: instance.magic_number_hex,
    mime_type: instance.mime_type,
    ctime: instance.ctime,
    mtime: instance.mtime,
    atime: instance.atime,
    parent_directory_ref: instance[INPUT_PARENT_DIRECTORY]?.standard_id,
    contains_refs: (instance[INPUT_CONTAINS] ?? []).map((m) => m.standard_id),
    content_ref: instance[INPUT_CONTENT]?.standard_id,
    extensions: {
      ...stixCyberObject.extensions,
      [STIX_EXT_OCTI_SCO]: cleanObject({
        ...stixCyberObject.extensions[STIX_EXT_OCTI_SCO],
        additional_names: instance.x_opencti_additional_names ?? []
      })
      // TODO implements stix extensions
    }
  };
};
const convertHostnameToStix = (instance: StoreCyberObservable, type: string): SCO.StixHostname => {
  assertType(ENTITY_HOSTNAME, type);
  const stixCyberObject = buildStixCyberObservable(instance);
  return {
    ...stixCyberObject,
    value: instance.value,
    labels: (instance[INPUT_LABELS] ?? []).map((m) => m.value),
    description: instance.x_opencti_description,
    score: instance.x_opencti_score,
    created_by_ref: instance[INPUT_CREATED_BY]?.standard_id,
    external_references: buildExternalReferences(instance),
    extensions: {
      ...stixCyberObject.extensions,
      [STIX_EXT_OCTI_SCO]: { extension_type: 'new-sco' }
    }
  };
};
const convertIPv4AddressToStix = (instance: StoreCyberObservable, type: string): SCO.StixIPv4Address => {
  assertType(ENTITY_IPV4_ADDR, type);
  return {
    ...buildStixCyberObservable(instance),
    value: instance.value,
    resolves_to_refs: (instance[INPUT_RESOLVES_TO] ?? []).map((m) => m.standard_id),
    belongs_to_refs: (instance[INPUT_BELONGS_TO] ?? []).map((m) => m.standard_id)
  };
};
const convertIPv6AddressToStix = (instance: StoreCyberObservable, type: string): SCO.StixIPv6Address => {
  assertType(ENTITY_IPV6_ADDR, type);
  return {
    ...buildStixCyberObservable(instance),
    value: instance.value,
    resolves_to_refs: (instance[INPUT_RESOLVES_TO] ?? []).map((m) => m.standard_id),
    belongs_to_refs: (instance[INPUT_BELONGS_TO] ?? []).map((m) => m.standard_id)
  };
};
const convertMacAddressToStix = (instance: StoreCyberObservable, type: string): SCO.StixMacAddress => {
  assertType(ENTITY_MAC_ADDR, type);
  return {
    ...buildStixCyberObservable(instance),
    value: instance.value,
  };
};
const convertMutexToStix = (instance: StoreCyberObservable, type: string): SCO.StixMutex => {
  assertType(ENTITY_MUTEX, type);
  return {
    ...buildStixCyberObservable(instance),
    name: instance.name,
  };
};
const convertNetworkTrafficToStix = (instance: StoreCyberObservable, type: string): SCO.StixNetworkTraffic => {
  assertType(ENTITY_NETWORK_TRAFFIC, type);
  return {
    ...buildStixCyberObservable(instance),
    start: instance.start,
    end: instance.end,
    is_active: instance.is_active,
    src_ref: instance[INPUT_SRC]?.standard_id,
    dst_ref: instance[INPUT_DST]?.standard_id,
    src_port: instance.src_port,
    dst_port: instance.dst_port,
    protocols: instance.protocols,
    src_byte_count: instance.src_byte_count,
    dst_byte_count: instance.dst_byte_count,
    src_packets: instance.src_packets,
    dst_packets: instance.dst_packets,
    ipfix: instance.ipfix,
    src_payload_ref: instance[INPUT_SRC_PAYLOAD]?.standard_id,
    dst_payload_ref: instance[INPUT_DST_PAYLOAD]?.standard_id,
    encapsulates_refs: (instance[INPUT_ENCAPSULATES] ?? []).map((m) => m.standard_id),
    encapsulated_by_ref: instance[INPUT_ENCAPSULATED_BY]?.standard_id,
  };
};
const convertProcessToStix = (instance: StoreCyberObservable, type: string): SCO.StixProcess => {
  assertType(ENTITY_PROCESS, type);
  return {
    ...buildStixCyberObservable(instance),
    is_hidden: instance.is_hidden,
    pid: instance.pid,
    created_time: instance.created_time,
    cwd: instance.cwd,
    command_line: instance.command_line,
    environment_variables: instance.environment_variables,
    opened_connection_refs: (instance[INPUT_OPENED_CONNECTION] ?? []).map((m) => m.standard_id),
    creator_user_ref: instance[INPUT_CREATOR_USER]?.standard_id,
    image_ref: instance[INPUT_IMAGE]?.standard_id,
    parent_ref: instance[INPUT_PARENT]?.standard_id,
    child_refs: (instance[INPUT_CHILD] ?? []).map((m) => m.standard_id),
  };
};
const convertSoftwareToStix = (instance: StoreCyberObservable, type: string): SCO.StixSoftware => {
  assertType(ENTITY_SOFTWARE, type);
  return {
    ...buildStixCyberObservable(instance),
    name: instance.name,
    cpe: instance.cpe,
    swid: instance.swid,
    languages: instance.languages,
    vendor: instance.vendor,
    version: instance.version,
  };
};
const convertTextToStix = (instance: StoreCyberObservable, type: string): SCO.StixText => {
  assertType(ENTITY_TEXT, type);
  const stixCyberObject = buildStixCyberObservable(instance);
  return {
    ...stixCyberObject,
    value: instance.value,
    labels: (instance[INPUT_LABELS] ?? []).map((m) => m.value),
    description: instance.x_opencti_description,
    score: instance.x_opencti_score,
    created_by_ref: instance[INPUT_CREATED_BY]?.standard_id,
    external_references: buildExternalReferences(instance),
    extensions: {
      ...stixCyberObject.extensions,
      [STIX_EXT_OCTI_SCO]: { extension_type: 'new-sco' }
    }
  };
};
const convertURLToStix = (instance: StoreCyberObservable, type: string): SCO.StixURL => {
  assertType(ENTITY_URL, type);
  return {
    ...buildStixCyberObservable(instance),
    value: instance.value,
  };
};
const convertUserAccountToStix = (instance: StoreCyberObservable, type: string): SCO.StixUserAccount => {
  assertType(ENTITY_USER_ACCOUNT, type);
  return {
    ...buildStixCyberObservable(instance),
    user_id: instance.user_id,
    credential: instance.credential,
    account_login: instance.account_login,
    account_type: instance.account_type,
    display_name: instance.display_name,
    is_service_account: instance.is_service_account,
    is_privileged: instance.is_privileged,
    can_escalate_privs: instance.can_escalate_privs,
    is_disabled: instance.is_disabled,
    account_created: instance.account_created,
    account_expires: instance.account_expires,
    credential_last_changed: instance.credential_last_changed,
    account_first_login: instance.account_first_login,
    account_last_login: instance.account_last_login,
  };
};
const convertWindowsRegistryKeyToStix = (instance: StoreCyberObservable, type: string): SCO.StixWindowsRegistryKey => {
  assertType(ENTITY_WINDOWS_REGISTRY_KEY, type);
  return {
    ...buildStixCyberObservable(instance),
    key: instance.attribute_key,
    values: buildWindowsRegistryValueType(instance),
    modified_time: instance.modified_time,
    creator_user_ref: instance[INPUT_CREATOR_USER]?.standard_id,
    number_of_subkeys: instance.number_of_subkeys,
  };
};
const convertX509CertificateToStix = (instance: StoreCyberObservable, type: string): SCO.StixX509Certificate => {
  assertType(ENTITY_HASHED_OBSERVABLE_X509_CERTIFICATE, type);
  return {
    ...buildStixCyberObservable(instance),
    is_self_signed: instance.is_self_signed,
    hashes: instance.hashes ?? {}, // TODO JRI Find a way to make that mandatory
    version: instance.version,
    serial_number: instance.serial_number,
    signature_algorithm: instance.signature_algorithm,
    issuer: instance.issuer,
    validity_not_before: instance.validity_not_before,
    validity_not_after: instance.validity_not_after,
    subject: instance.subject,
    subject_public_key_algorithm: instance.subject_public_key_algorithm,
    subject_public_key_modulus: instance.subject_public_key_modulus,
    subject_public_key_exponent: instance.subject_public_key_exponent,
    x509_v3_extensions: cleanObject({
      basic_constraints: instance.basic_constraints,
      name_constraints: instance.name_constraints,
      policy_constraints: instance.policy_constraints,
      key_usage: instance.key_usage,
      extended_key_usage: instance.extended_key_usage,
      subject_key_identifier: instance.subject_key_identifier,
      authority_key_identifier: instance.authority_key_identifier,
      subject_alternative_name: instance.subject_alternative_name,
      issuer_alternative_name: instance.issuer_alternative_name,
      subject_directory_attributes: instance.subject_directory_attributes,
      crl_distribution_points: instance.crl_distribution_points,
      inhibit_any_policy: instance.inhibit_any_policy,
      private_key_usage_period_not_before: instance.private_key_usage_period_not_before,
      private_key_usage_period_not_after: instance.private_key_usage_period_not_after,
      certificate_policies: instance.certificate_policies,
      policy_mappings: instance.policy_mappings,
    })
  };
};

const checkInstanceCompletion = (instance: StoreRelation) => {
  if (instance.from === undefined || isEmptyField(instance.from)) {
    throw UnsupportedError(`Cannot convert relation without a resolved from: ${instance.fromId}`);
  }
  if (instance.to === undefined || isEmptyField(instance.to)) {
    throw UnsupportedError(`Cannot convert relation without a resolved to: ${instance.toId}`);
  }
};

// SRO
const convertRelationToStix = (instance: StoreRelation): SRO.StixRelation => {
  checkInstanceCompletion(instance);
  const stixRelationship = buildStixRelationship(instance);
  return {
    ...stixRelationship,
    relationship_type: instance.relationship_type,
    description: instance.description,
    source_ref: instance.from?.standard_id,
    target_ref: instance.to?.standard_id,
    start_time: instance.start_time,
    stop_time: instance.stop_time,
    external_references: buildExternalReferences(instance),
    extensions: {
      [STIX_EXT_OCTI]: cleanObject({
        ...stixRelationship.extensions[STIX_EXT_OCTI],
        source_ref: instance.from?.internal_id,
        source_type: instance.from?.entity_type,
        target_ref: instance.to?.internal_id,
        target_type: instance.to?.entity_type,
        kill_chain_phases: buildKillChainPhases(instance)
      })
    }
  };
};
const convertSightingToStix = (instance: StoreRelation): SRO.StixSighting => {
  checkInstanceCompletion(instance);
  const stixRelationship = buildStixRelationship(instance);
  return {
    ...stixRelationship,
    description: instance.description,
    first_seen: instance.first_seen,
    last_seen: instance.last_seen,
    count: instance.attribute_count,
    sighting_of_ref: instance.from?.standard_id,
    where_sighted_refs: instance.to?.standard_id ? [instance.to?.standard_id] : [],
    summary: instance.summary,
    observed_data_refs: [], // TODO Add support
    extensions: {
      [STIX_EXT_OCTI]: cleanObject({
        ...stixRelationship.extensions[STIX_EXT_OCTI],
        sighting_of_ref: instance.from?.internal_id,
        sighting_of_type: instance.from?.entity_type,
        where_sighted_refs: instance.to?.internal_id ? [instance.to?.internal_id] : [],
        where_sighted_types: instance.to?.entity_type ? [instance.to?.entity_type] : [],
        negative: instance.x_opencti_negative,
      })
    }
  };
};

// SMO - SDO
const convertMarkingToStix = (instance: StoreEntity): SMO.StixMarkingDefinition => {
  const marking = buildStixMarkings(instance);
  return {
    ...marking,
    name: instance.definition,
    definition_type: instance.definition_type,
    extensions: {
      [STIX_EXT_OCTI]: cleanObject({
        ...marking.extensions[STIX_EXT_OCTI],
        order: instance.x_opencti_order,
        color: instance.x_opencti_color,
      })
    }
  };
};
const convertLabelToStix = (instance: StoreEntity): SMO.StixLabel => {
  const label = buildStixObject(instance);
  return {
    ...label,
    value: instance.value,
    color: instance.color,
    extensions: {
      [STIX_EXT_OCTI]: cleanObject({
        ...label.extensions[STIX_EXT_OCTI],
        extension_type: 'new-sdo',
      })
    }
  };
};
const convertKillChainPhaseToStix = (instance: StoreEntity): SMO.StixKillChainPhase => {
  const killChain = buildStixObject(instance);
  return {
    ...killChain,
    kill_chain_name: instance.kill_chain_name,
    phase_name: instance.phase_name,
    order: instance.x_opencti_order,
    extensions: {
      [STIX_EXT_OCTI]: cleanObject({
        ...killChain.extensions[STIX_EXT_OCTI],
        extension_type: 'new-sdo',
      })
    }
  };
};
const convertExternalReferenceToStix = (instance: StoreEntity): SMO.StixExternalReference => {
  const reference = buildStixObject(instance);
  return {
    ...reference,
    source_name: instance.source_name,
    description: instance.description,
    url: instance.url,
    hashes: instance.hashes ?? {}, // TODO JRI Find a way to make that mandatory
    external_id: instance.external_id,
    extensions: {
      [STIX_EXT_OCTI]: cleanObject({
        ...reference.extensions[STIX_EXT_OCTI],
        extension_type: 'new-sdo',
      })
    }
  };
};

// SMO - SCO
const convertWindowsRegistryValueToStix = (instance: StoreCyberObservable): SCO.StixWindowsRegistryValueType => {
  const stixCyberObject = buildStixCyberObservable(instance);
  return {
    ...stixCyberObject,
    name: instance.name,
    data: instance.data,
    data_type: instance.data_type,
    labels: (instance[INPUT_LABELS] ?? []).map((m) => m.value),
    description: instance.x_opencti_description,
    score: instance.x_opencti_score,
    created_by_ref: instance[INPUT_CREATED_BY]?.standard_id,
    external_references: buildExternalReferences(instance),
    extensions: {
      [STIX_EXT_OCTI]: stixCyberObject.extensions[STIX_EXT_OCTI],
      [STIX_EXT_OCTI_SCO]: { extension_type: 'new-sco' }
    }
  };
};
const convertEmailMimePartToStix = (instance: StoreCyberObservable): SCO.StixEmailBodyMultipart => {
  const stixCyberObject = buildStixCyberObservable(instance);
  return {
    ...stixCyberObject,
    content_type: instance.content_type,
    content_disposition: instance.content_disposition,
    body: instance.body,
    body_raw_ref: instance[INPUT_BODY_RAW]?.standard_id,
    labels: (instance[INPUT_LABELS] ?? []).map((m) => m.value),
    description: instance.x_opencti_description,
    score: instance.x_opencti_score,
    created_by_ref: instance[INPUT_CREATED_BY]?.standard_id,
    external_references: buildExternalReferences(instance),
    extensions: {
      [STIX_EXT_OCTI]: stixCyberObject.extensions[STIX_EXT_OCTI],
      [STIX_EXT_OCTI_SCO]: { extension_type: 'new-sco' }
    }
  };
};

// CONVERTERS
const convertToStix = (instance: StoreObject): S.StixObject => {
  const type = instance.entity_type;
  if (!isStixObject(type) && !isStixRelationship(type)) {
    throw UnsupportedError(`Type ${type} cannot be converted to Stix`, { instance });
  }
  // SRO: relations and sightings
  if (isStixRelationship(type)) {
    const basic = instance as StoreRelation;
    if (isStixCoreRelationship(type)) {
      return convertRelationToStix(basic);
    }
    if (isStixCyberObservableRelationship(type)) {
      return convertRelationToStix(basic);
    }
    if (isStixSightingRelationship(type)) {
      return convertSightingToStix(basic);
    }
    if (isStixMetaRelationship(type)) {
      return convertRelationToStix(basic);
    }
    throw UnsupportedError(`No relation converter available for ${type}`);
  }
  // SDO: domains
  if (isStixDomainObject(type)) {
    const basic = instance as StoreEntity;
    // ENTITY_TYPE_IDENTITY_INDIVIDUAL,
    // ENTITY_TYPE_IDENTITY_ORGANIZATION,
    // ENTITY_TYPE_IDENTITY_SECTOR,
    // ENTITY_TYPE_IDENTITY_SYSTEM,
    if (isStixDomainObjectIdentity(type)) {
      return convertIdentityToStix(basic, type);
    }
    // ENTITY_TYPE_LOCATION_CITY,
    // ENTITY_TYPE_LOCATION_COUNTRY,
    // ENTITY_TYPE_LOCATION_REGION,
    // ENTITY_TYPE_LOCATION_POSITION,
    if (isStixDomainObjectLocation(type)) {
      return convertLocationToStix(basic, type);
    }
    // Remaining
    if (ENTITY_TYPE_CONTAINER_REPORT === type) {
      return convertReportToStix(basic, type);
    }
    if (ENTITY_TYPE_MALWARE === type) {
      return convertMalwareToStix(basic, type);
    }
    if (ENTITY_TYPE_INFRASTRUCTURE === type) {
      return convertInfrastructureToStix(basic, type);
    }
    if (ENTITY_TYPE_ATTACK_PATTERN === type) {
      return convertAttackPatternToStix(basic, type);
    }
    if (ENTITY_TYPE_CAMPAIGN === type) {
      return convertCampaignToStix(basic, type);
    }
    if (ENTITY_TYPE_THREAT_ACTOR === type) {
      return convertThreatActorToStix(basic, type);
    }
    if (ENTITY_TYPE_CONTAINER_NOTE === type) {
      return convertNoteToStix(basic, type);
    }
    if (ENTITY_TYPE_CONTAINER_OPINION === type) {
      return convertOpinionToStix(basic, type);
    }
    if (ENTITY_TYPE_CONTAINER_OBSERVED_DATA === type) {
      return convertObservedDateToStix(basic, type);
    }
    if (ENTITY_TYPE_COURSE_OF_ACTION === type) {
      return convertCourseOfActionToStix(basic, type);
    }
    if (ENTITY_TYPE_INCIDENT === type) {
      return convertIncidentToStix(basic, type);
    }
    if (ENTITY_TYPE_INDICATOR === type) {
      return convertIndicatorToStix(basic, type);
    }
    if (ENTITY_TYPE_INTRUSION_SET === type) {
      return convertIntrusionSetToStix(basic, type);
    }
    if (ENTITY_TYPE_TOOL === type) {
      return convertToolToStix(basic, type);
    }
    if (ENTITY_TYPE_VULNERABILITY === type) {
      return convertVulnerabilityToStix(basic, type);
    }
    // No converter found
    throw UnsupportedError(`No entity converter available for ${type}`);
  }
  // SMO: metas
  if (isStixMetaObject(type)) {
    const basic = instance as StoreEntity;
    if (ENTITY_TYPE_MARKING_DEFINITION === type) {
      return convertMarkingToStix(basic);
    }
    if (ENTITY_TYPE_LABEL === type) {
      return convertLabelToStix(basic);
    }
    if (ENTITY_TYPE_KILL_CHAIN_PHASE === type) {
      return convertKillChainPhaseToStix(basic);
    }
    if (ENTITY_TYPE_EXTERNAL_REFERENCE === type) {
      return convertExternalReferenceToStix(basic);
    }
    // No converter found
    throw UnsupportedError(`No meta converter available for ${type}`);
  }
  // SCO: Cyber observables
  if (isStixCyberObservable(type)) {
    const cyber = instance as StoreCyberObservable;
    // Meta observable
    if (ENTITY_WINDOWS_REGISTRY_VALUE_TYPE === type) {
      return convertWindowsRegistryValueToStix(cyber);
    }
    if (ENTITY_EMAIL_MIME_PART_TYPE === type) {
      return convertEmailMimePartToStix(cyber);
    }
    // Observables
    if (ENTITY_HASHED_OBSERVABLE_ARTIFACT === type) {
      return convertArtifactToStix(cyber, type);
    }
    if (ENTITY_AUTONOMOUS_SYSTEM === type) {
      return convertAutonomousSystemToStix(cyber, type);
    }
    if (ENTITY_CRYPTOGRAPHIC_WALLET === type) {
      return convertCryptocurrencyWalletToStix(cyber, type);
    }
    if (ENTITY_CRYPTOGRAPHIC_KEY === type) {
      return convertCryptographicKeyToStix(cyber, type);
    }
    if (ENTITY_DIRECTORY === type) {
      return convertDirectoryToStix(cyber, type);
    }
    if (ENTITY_DOMAIN_NAME === type) {
      return convertDomainNameToStix(cyber, type);
    }
    if (ENTITY_EMAIL_ADDR === type) {
      return convertEmailAddressToStix(cyber, type);
    }
    if (ENTITY_EMAIL_MESSAGE === type) {
      return convertEmailMessageToStix(cyber, type);
    }
    if (ENTITY_HASHED_OBSERVABLE_STIX_FILE === type) {
      return convertFileToStix(cyber, type);
    }
    if (ENTITY_HOSTNAME === type) {
      return convertHostnameToStix(cyber, type);
    }
    if (ENTITY_IPV4_ADDR === type) {
      return convertIPv4AddressToStix(cyber, type);
    }
    if (ENTITY_IPV6_ADDR === type) {
      return convertIPv6AddressToStix(cyber, type);
    }
    if (ENTITY_MAC_ADDR === type) {
      return convertMacAddressToStix(cyber, type);
    }
    if (ENTITY_MUTEX === type) {
      return convertMutexToStix(cyber, type);
    }
    if (ENTITY_NETWORK_TRAFFIC === type) {
      return convertNetworkTrafficToStix(cyber, type);
    }
    if (ENTITY_PROCESS === type) {
      return convertProcessToStix(cyber, type);
    }
    if (ENTITY_SOFTWARE === type) {
      return convertSoftwareToStix(cyber, type);
    }
    if (ENTITY_TEXT === type) {
      return convertTextToStix(cyber, type);
    }
    if (ENTITY_URL === type) {
      return convertURLToStix(cyber, type);
    }
    if (ENTITY_USER_ACCOUNT === type) {
      return convertUserAccountToStix(cyber, type);
    }
    if (ENTITY_WINDOWS_REGISTRY_KEY === type) {
      return convertWindowsRegistryKeyToStix(cyber, type);
    }
    if (ENTITY_HASHED_OBSERVABLE_X509_CERTIFICATE === type) {
      return convertX509CertificateToStix(cyber, type);
    }
    // No converter found
    throw UnsupportedError(`No meta cyber observable available for ${type}`);
  }
  throw UnsupportedError(`No converter available for ${type}`);
};

export const convertStoreToStix = (instance: StoreObject): S.StixObject => {
  if (isEmptyField(instance._index) || isEmptyField(instance.entity_type)) {
    throw UnsupportedError('convertInstanceToStix must be used with opencti fully loaded instance');
  }
  const converted = convertToStix(instance);
  const stix = cleanObject(converted);
  if (!isValidStix(stix)) {
    throw FunctionalError('Invalid stix data conversion', { data: instance });
  }
  return stix;
};
