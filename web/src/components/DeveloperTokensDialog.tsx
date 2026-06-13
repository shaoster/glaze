import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createAgentToken,
  listAgentTokens,
  revokeAgentToken,
} from "../util/api";
import type { AgentToken } from "../util/types";

type DeveloperTokensDialogProps = {
  open: boolean;
  onClose: () => void;
};

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export function DeveloperTokensDialog({
  open,
  onClose,
}: DeveloperTokensDialogProps) {
  const queryClient = useQueryClient();
  const [newTokenName, setNewTokenName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    data: tokens = [],
    isLoading,
  } = useQuery<AgentToken[]>({
    queryKey: ["agentTokens"],
    queryFn: listAgentTokens,
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createAgentToken(name),
    onSuccess: (data) => {
      setCreatedToken(data.token);
      setNewTokenName("");
      queryClient.invalidateQueries({ queryKey: ["agentTokens"] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeAgentToken(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agentTokens"] });
    },
  });

  function handleCreate() {
    if (newTokenName.trim()) {
      createMutation.mutate(newTokenName.trim());
    }
  }

  function handleCopy() {
    if (createdToken) {
      navigator.clipboard.writeText(createdToken).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  function handleClose() {
    setCreatedToken(null);
    setCopied(false);
    setNewTokenName("");
    createMutation.reset();
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Developer Tokens</DialogTitle>
      {isLoading && <LinearProgress />}
      <DialogContent>
        <Stack spacing={3}>
          <Typography variant="body2" color="text.secondary">
            Tokens authenticate external agents (MCP servers, ChatGPT actions) via{" "}
            <code>Authorization: Bearer pdagent_…</code>. Tokens have standard user
            permissions — staff privileges are never granted.
          </Typography>

          {createdToken && (
            <Alert severity="warning">
              <Typography variant="body2" fontWeight="bold" gutterBottom>
                Copy this token now — it will not be shown again.
              </Typography>
              <TextField
                fullWidth
                size="small"
                value={createdToken}
                InputProps={{
                  readOnly: true,
                  sx: { fontFamily: "monospace", fontSize: "0.8rem" },
                  endAdornment: (
                    <InputAdornment position="end">
                      <Tooltip title={copied ? "Copied!" : "Copy to clipboard"}>
                        <IconButton onClick={handleCopy} edge="end">
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </InputAdornment>
                  ),
                }}
              />
            </Alert>
          )}

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Create new token
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                size="small"
                label="Token name"
                placeholder="e.g. Claude MCP"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                disabled={createMutation.isPending}
                sx={{ flexGrow: 1 }}
              />
              <Button
                variant="contained"
                onClick={handleCreate}
                disabled={!newTokenName.trim() || createMutation.isPending}
                startIcon={
                  createMutation.isPending ? (
                    <CircularProgress size={16} />
                  ) : undefined
                }
              >
                Create
              </Button>
            </Stack>
            {createMutation.isError && (
              <Alert severity="error" sx={{ mt: 1 }}>
                Failed to create token. Please try again.
              </Alert>
            )}
          </Box>

          <Divider />

          {tokens.length === 0 && !isLoading ? (
            <Typography variant="body2" color="text.secondary" textAlign="center">
              No active tokens. Create one above.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Last used</TableCell>
                  <TableCell align="right">Revoke</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tokens.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell>{token.name}</TableCell>
                    <TableCell>{formatDate(token.created_at)}</TableCell>
                    <TableCell>{formatDate(token.last_used_at)}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Revoke token">
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            aria-label="Revoke token"
                            onClick={() => revokeMutation.mutate(token.id)}
                            disabled={revokeMutation.isPending}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
