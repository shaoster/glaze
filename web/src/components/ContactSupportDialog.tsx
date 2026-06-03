import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import {
  fetchSupportThread,
  sendSupportMessage,
  type SupportThread,
} from "../util/api";

interface ContactSupportDialogProps {
  open: boolean;
  authenticated: boolean;
  onClose: () => void;
}

const SUPPORT_THREAD_QUERY_KEY = ["support-thread"];

function formatTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function MessageBubble({
  sender,
  body,
  created,
}: SupportThread["messages"][number]) {
  const isUser = sender === "user";
  return (
    <Paper
      variant="outlined"
      sx={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "82%",
        px: 1.5,
        py: 1,
        bgcolor: isUser ? "action.selected" : "background.paper",
      }}
    >
      <Stack spacing={0.5}>
        <Typography variant="caption" color="text.secondary">
          {isUser ? "You" : "PotterDoc"} • {formatTimestamp(created)}
        </Typography>
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
          {body}
        </Typography>
      </Stack>
    </Paper>
  );
}

export default function ContactSupportDialog({
  open,
  authenticated,
  onClose,
}: ContactSupportDialogProps) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");

  const {
    data: thread,
    isLoading,
    isError,
  } = useQuery({
    queryKey: SUPPORT_THREAD_QUERY_KEY,
    queryFn: fetchSupportThread,
    enabled: open && authenticated,
  });

  const { mutate: submitMessage, isPending } = useMutation({
    mutationFn: sendSupportMessage,
    onSuccess: (updatedThread) => {
      queryClient.setQueryData(SUPPORT_THREAD_QUERY_KEY, updatedThread);
      setBody("");
    },
  });

  const canSend = authenticated && body.trim().length > 0 && !isPending;

  return (
    <Dialog
      key={`${authenticated ? "auth" : "guest"}-${open ? "open" : "closed"}`}
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{
        sx: {
          height: { xs: "86dvh", sm: "78dvh" },
        },
      }}
    >
      <DialogTitle>Contact Us</DialogTitle>
      <DialogContent
        dividers
        sx={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        <DialogContentText>
          Send the PotterDoc team a message here. We keep the conversation in
          your account so replies stay inside the app instead of getting routed
          through email.
        </DialogContentText>

        {!authenticated ? (
          <Alert severity="info">
            Sign in first, and this panel becomes your in-app support inbox.
          </Alert>
        ) : isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress />
          </Box>
        ) : isError ? (
          <Alert severity="error">
            We could not load your support thread. Please try again.
          </Alert>
        ) : (
          <Stack spacing={1.5} sx={{ minHeight: 0, flex: 1 }}>
            <Box>
              <Typography variant="h6" component="h2">
                {thread?.subject ?? "Start a new conversation"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {thread?.is_closed
                  ? "This thread is closed. Send a new message to start a fresh request."
                  : "Replies stay attached to this thread so you can follow the full conversation."}
              </Typography>
            </Box>

            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 1.25,
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                pr: 0.5,
              }}
            >
              {thread?.messages?.length ? (
                thread.messages.map((message) => (
                  <MessageBubble key={message.id} {...message} />
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Your thread will appear here after you send your first
                  message.
                </Typography>
              )}
            </Box>

            <TextField
              label="Your message"
              multiline
              minRows={4}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Tell us what you need help with..."
              disabled={isPending}
              slotProps={{ htmlInput: { maxLength: 4000 } }}
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {authenticated && (
          <Button
            variant="contained"
            onClick={() => submitMessage(body)}
            disabled={!canSend}
          >
            {isPending ? "Sending…" : thread?.is_closed ? "Start request" : "Send"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
