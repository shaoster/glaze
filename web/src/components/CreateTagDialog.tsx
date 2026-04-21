import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    TextField,
} from '@mui/material'

import { TAG_COLOR_OPTIONS } from './tagPalette'

interface CreateTagDialogProps {
    open: boolean
    name: string
    color: string
    error: string | null
    saving: boolean
    onClose: () => void
    onNameChange: (value: string) => void
    onColorChange: (value: string) => void
    onCreate: () => void
}

export default function CreateTagDialog({
    open,
    name,
    color,
    error,
    saving,
    onClose,
    onNameChange,
    onColorChange,
    onCreate,
}: CreateTagDialogProps) {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Create tag</DialogTitle>
            <DialogContent>
                <TextField
                    label="Tag name"
                    value={name}
                    onChange={(event) => onNameChange(event.target.value)}
                    fullWidth
                    margin="dense"
                    slotProps={{ htmlInput: { maxLength: 64 } }}
                />
                <DialogContentText sx={{ mt: 2, mb: 1 }}>
                    Tag color
                </DialogContentText>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {TAG_COLOR_OPTIONS.map((option) => (
                        <Button
                            key={option}
                            onClick={() => onColorChange(option)}
                            variant={color === option ? 'contained' : 'outlined'}
                            sx={{
                                minWidth: 0,
                                width: 36,
                                height: 36,
                                backgroundColor: option,
                                borderColor: option,
                                color: 'common.black',
                            }}
                        >
                            {' '}
                        </Button>
                    ))}
                </Box>
                {error && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {error}
                    </Alert>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={saving}>Cancel</Button>
                <Button onClick={onCreate} disabled={saving}>Create</Button>
            </DialogActions>
        </Dialog>
    )
}
