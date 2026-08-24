export const VERIFY_CONNECTION_QUERY = `
  query SoundVaultCyaniteHealth {
    libraryTracks(first: 1) { pageInfo { hasNextPage } }
  }
`;

export const FIND_BY_EXTERNAL_ID_QUERY = `
  query SoundVaultTrackByExternalId($externalId: String!) {
    libraryTracks(first: 2, filter: { externalId: $externalId }) {
      edges { node { id externalId } }
    }
  }
`;

export const FILE_UPLOAD_REQUEST_MUTATION = `
  mutation SoundVaultFileUploadRequest {
    fileUploadRequest { id uploadUrl }
  }
`;

export const LIBRARY_TRACK_CREATE_MUTATION = `
  mutation SoundVaultLibraryTrackCreate($input: LibraryTrackCreateInput!) {
    libraryTrackCreate(input: $input) {
      __typename
      ... on LibraryTrackCreateSuccess {
        createdLibraryTrack { id externalId }
      }
      ... on LibraryTrackCreateError { code message }
    }
  }
`;

export const LIBRARY_TRACK_V7_QUERY = `
  query SoundVaultLibraryTrackV7($id: ID!) {
    libraryTrack(id: $id) {
      __typename
      ... on LibraryTrack {
        id
        externalId
        audioAnalysisV7 {
          __typename
          ... on AudioAnalysisV7Finished {
            result {
              advancedGenreTags
              advancedSubgenreTags
              advancedInstrumentTags
              advancedInstrumentTagsExtended
              moodTags
              moodAdvancedTags
              bpmPrediction { value confidence }
              bpmRangeAdjusted
              keyPrediction { value confidence }
              timeSignature
              energyLevel
              energyDynamics
              valence
              arousal
              emotionalDynamics
              emotionalProfile
              voiceTags
              voicePresenceProfile
              predominantVoiceGender
              voiceoverExists
              voiceoverDegree
              characterTags
              movementTags
              musicalEraTag
              transformerCaption
              freeGenreTags
              segments { timestamps valence arousal }
            }
          }
          ... on AudioAnalysisV7Failed { error { message } }
        }
      }
      ... on LibraryTrackNotFoundError { message }
    }
  }
`;
