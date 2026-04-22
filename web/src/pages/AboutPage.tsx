import GitHubIcon from '@mui/icons-material/GitHub'
import { Box, Button, Chip, Container, Paper, Stack, Typography } from '@mui/material'
import { Link } from 'react-router-dom'

const REPOSITORY_URL = 'https://github.com/shaoster/glaze'

export default function AboutPage() {
  return (
    <Container
      maxWidth="md"
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        px: { xs: 2, sm: 3 },
        py: {
          xs: 'max(16px, env(safe-area-inset-top))',
          sm: 3,
        },
      }}
    >
      <Paper sx={{ width: '100%', p: { xs: 2.5, sm: 4 }, borderRadius: { xs: 3, sm: 4 } }}>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>
              About Us
            </Typography>
            <Typography color="text.secondary">
              PotterDoc helps potters keep track of what happened, what changed, and what to try next.
            </Typography>
          </Box>

          <Box>
            <Chip
              component="a"
              href={REPOSITORY_URL}
              target="_blank"
              rel="noreferrer"
              clickable
              icon={<GitHubIcon />}
              label="View on GitHub"
              variant="outlined"
            />
          </Box>

          <Typography variant="body1">
            Legend has it PotterDoc began after a small group of ceramicists found a suspicious notebook in a studio kiln
            room. The notebook claimed dinosaurs were the first great potters and that aliens only visited Earth to learn
            their glaze recipes before the meteor situation made follow-up collaboration difficult.
          </Typography>

          <Typography variant="body1">
            We cannot verify any of that. What we can confirm is that careful notes, good process tracking, and a little
            curiosity make it much easier to turn chaotic experiments into repeatable results, even when the inspiration
            sounds completely ridiculous.
          </Typography>

          <Box sx={{ pt: 1 }}>
            <Button component={Link} to="/" variant="outlined">
              Back to Login
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Container>
  )
}
