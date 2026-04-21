import Box from '@mui/material/Box'

import TagChip from './TagChip'

export interface TagChipListItem {
    id: string
    name: string
    color: string
}

interface TagChipListProps {
    tags: TagChipListItem[]
}

export default function TagChipList({ tags }: TagChipListProps) {
    if (tags.length === 0) {
        return null
    }

    return (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {tags.map((tag) => (
                <TagChip key={tag.id} label={tag.name} color={tag.color} />
            ))}
        </Box>
    )
}
