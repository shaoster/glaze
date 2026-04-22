import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import CreateTagDialog from '../CreateTagDialog'
import TagAutocomplete from '../TagAutocomplete'
import TagChipList from '../TagChipList'

const TAGS = [
    { id: 'gift', name: 'Gift', color: '#2A9D8F' },
    { id: 'sale', name: 'For Sale', color: '#4FC3F7' },
]

describe('TagChipList', () => {
    it('renders each tag label', () => {
        render(<TagChipList tags={TAGS} />)
        expect(screen.getByText('Gift')).toBeInTheDocument()
        expect(screen.getByText('For Sale')).toBeInTheDocument()
    })
})

describe('TagAutocomplete', () => {
    it('calls onChange with the selected tags', async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()

        render(
            <TagAutocomplete
                label="Tags"
                options={TAGS}
                value={[]}
                onChange={onChange}
            />
        )

        await user.click(screen.getByLabelText('Tags'))
        await user.click(screen.getByRole('option', { name: 'Gift' }))

        expect(onChange).toHaveBeenCalledWith([TAGS[0]])
    })
})

describe('CreateTagDialog', () => {
    it('renders the create dialog fields', () => {
        render(
            <CreateTagDialog
                open
                name="Gift"
                color="#2A9D8F"
                error={null}
                saving={false}
                onClose={vi.fn()}
                onNameChange={vi.fn()}
                onColorChange={vi.fn()}
                onCreate={vi.fn()}
            />
        )

        expect(screen.getByLabelText('Tag name')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Select #2A9D8F tag color' })).toHaveAttribute('aria-pressed', 'true')
    })
})
