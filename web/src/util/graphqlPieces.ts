import { gql } from "graphql-request";

import type { PieceSortOrder } from "./api";

/** GraphQL ordering enum values keyed by the REST sort-order strings. */
export const PIECE_ORDERING_GQL: Record<PieceSortOrder, string> = {
  "-last_modified": "LAST_MODIFIED_DESC",
  last_modified: "LAST_MODIFIED_ASC",
  name: "NAME_ASC",
  "-name": "NAME_DESC",
  created: "CREATED_ASC",
  "-created": "CREATED_DESC",
};

export interface PiecesFilterInput {
  state?: string[];
  shared?: boolean;
  search?: string;
  tagIds?: string[];
}

export interface PiecesQueryVariables {
  filter?: PiecesFilterInput;
  ordering?: string;
  limit?: number;
  offset?: number;
}

// Field aliases map the schema's camelCase fields back to the snake_case shape
// the existing REST mappers (mapPieceSummary) consume, so the mapping layer is
// shared between REST and GraphQL.
export const PIECES_QUERY = gql`
  query Pieces(
    $filter: PieceFilter
    $ordering: PieceOrdering
    $limit: Int
    $offset: Int
  ) {
    pieces(filter: $filter, ordering: $ordering, limit: $limit, offset: $offset) {
      count
      results {
        id
        name
        created
        last_modified: lastModified
        photo_count: photoCount
        shared
        is_editable: isEditable
        can_edit: canEdit
        showcase_story: showcaseStory
        showcase_fields: showcaseFields
        current_location: currentLocation
        current_state: currentState {
          state
        }
        thumbnail {
          url
          cropped_url: croppedUrl
          image_id: imageId
          width
          height
          r2_key: r2Key
          crop_task_failed: cropTaskFailed
          crop {
            x
            y
            width
            height
          }
        }
        tags {
          id
          name
          color
          is_public: isPublic
        }
      }
    }
  }
`;
