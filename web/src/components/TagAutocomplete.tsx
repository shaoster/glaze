import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'
import type { SxProps, Theme } from '@mui/material/styles'

import TagChip from './TagChip'

export interface TagAutocompleteOption {
    id: string
    name: string
    color: string
}

interface TagAutocompleteProps {
    label: string
    options: TagAutocompleteOption[]
    value: TagAutocompleteOption[]
    onChange: (value: TagAutocompleteOption[]) => void
    disabled?: boolean
    helperText?: string
    sx?: SxProps<Theme>
}

export default function TagAutocomplete({
    label,
    options,
    value,
    onChange,
    disabled = false,
    helperText,
    sx,
}: TagAutocompleteProps) {
    return (
        <Autocomplete
            multiple
            size="small"
            options={options}
            value={value}
            onChange={(_event, nextValue) => onChange(nextValue)}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(option, selected) => option.id === selected.id}
            renderTags={(selected, getTagProps) =>
                selected.map((option, index) => (
                    <TagChip
                        key={option.id}
                        label={option.name}
                        color={option.color}
                        onDelete={() => {
                            getTagProps({ index }).onDelete?.({} as never)
                        }}
                    />
                ))
            }
            renderInput={(params) => (
                <TextField
                    {...params}
                    label={label}
                    helperText={helperText}
                />
            )}
            disabled={disabled}
            sx={sx}
        />
    )
}
