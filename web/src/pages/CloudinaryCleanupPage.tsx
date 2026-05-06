import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";

import {
  deleteCloudinaryCleanupAssets,
  scanCloudinaryCleanupAssets,
  type CloudinaryCleanupAsset,
  type CloudinaryCleanupScanResponse,
} from "../util/api";

function formatBytes(bytes: number | null) {
  if (bytes === null) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCreatedAt(value: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function CloudinaryCleanupPage() {
  const [scanResult, setScanResult] =
    useState<CloudinaryCleanupScanResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletedCount, setDeletedCount] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const unusedAssets = useMemo(
    () => scanResult?.assets.filter((asset) => !asset.referenced) ?? [],
    [scanResult],
  );
  const selectedAssets = useMemo(
    () => unusedAssets.filter((asset) => selected.has(asset.public_id)),
    [selected, unusedAssets],
  );
  const allUnusedSelected =
    unusedAssets.length > 0 && selected.size === unusedAssets.length;

  async function handleScan() {
    setLoading(true);
    setError(null);
    setDeletedCount(null);
    try {
      const result = await scanCloudinaryCleanupAssets();
      setScanResult(result);
      setSelected(
        new Set(
          result.assets.filter((a) => !a.referenced).map((a) => a.public_id),
        ),
      );
    } catch {
      setError("Unable to scan Cloudinary assets.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    const publicIds = selectedAssets.map((asset) => asset.public_id);
    if (!publicIds.length) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteCloudinaryCleanupAssets(publicIds);
      setDeletedCount(publicIds.length);
      setSelected(new Set());
      setConfirmOpen(false);
      setScanResult((current) => {
        if (!current) return current;
        const deleted = new Set(publicIds);
        const assets = current.assets.filter(
          (asset) => !deleted.has(asset.public_id),
        );
        const unused = assets.filter((asset) => !asset.referenced).length;
        return {
          assets,
          summary: {
            total: assets.length,
            referenced: assets.length - unused,
            unused,
          },
        };
      });
    } catch {
      setError("Unable to delete the selected assets.");
    } finally {
      setDeleting(false);
    }
  }

  function toggleAsset(asset: CloudinaryCleanupAsset) {
    if (asset.referenced) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(asset.public_id)) {
        next.delete(asset.public_id);
      } else {
        next.add(asset.public_id);
      }
      return next;
    });
  }

  function toggleAllUnused() {
    setSelected(
      allUnusedSelected
        ? new Set()
        : new Set(unusedAssets.map((asset) => asset.public_id)),
    );
  }

  return (
    <Stack spacing={2.5} sx={{ py: 2 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", sm: "center" }}
        spacing={1.5}
      >
        <Box>
          <Typography variant="h4" component="h1">
            Cloudinary Cleanup
          </Typography>
          <Typography color="text.secondary">
            Find uploaded image assets that are not referenced by PotterDoc.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={loading ? <CircularProgress size={16} /> : <SearchIcon />}
          onClick={handleScan}
          disabled={loading || deleting}
        >
          {scanResult ? "Scan Again" : "Scan Assets"}
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {deletedCount !== null && (
        <Alert severity="success">{deletedCount} assets deleted.</Alert>
      )}

      {scanResult && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Paper sx={{ px: 2, py: 1.5, flex: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Total
            </Typography>
            <Typography variant="h5">{scanResult.summary.total}</Typography>
          </Paper>
          <Paper sx={{ px: 2, py: 1.5, flex: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Referenced
            </Typography>
            <Typography variant="h5">
              {scanResult.summary.referenced}
            </Typography>
          </Paper>
          <Paper sx={{ px: 2, py: 1.5, flex: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Unused
            </Typography>
            <Typography variant="h5">{scanResult.summary.unused}</Typography>
          </Paper>
        </Stack>
      )}

      {scanResult && (
        <Stack spacing={1.5}>
          <Stack direction="row" justifyContent="space-between" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={handleScan}
              disabled={loading || deleting}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => setConfirmOpen(true)}
              disabled={!selectedAssets.length || deleting}
            >
              Delete Selected
            </Button>
          </Stack>

          <TableContainer component={Paper}>
            <Table size="small" aria-label="Cloudinary cleanup assets">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={allUnusedSelected}
                      indeterminate={
                        selected.size > 0 && selected.size < unusedAssets.length
                      }
                      onChange={toggleAllUnused}
                      disabled={!unusedAssets.length || deleting}
                      inputProps={{ "aria-label": "Select all unused assets" }}
                    />
                  </TableCell>
                  <TableCell>Asset</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Size</TableCell>
                  <TableCell>Created</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {scanResult.assets.map((asset) => (
                  <TableRow key={asset.public_id} hover>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selected.has(asset.public_id)}
                        onChange={() => toggleAsset(asset)}
                        disabled={asset.referenced || deleting}
                        inputProps={{
                          "aria-label": `Select ${asset.public_id}`,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={1.5}>
                        {asset.url ? (
                          <Box
                            component="img"
                            src={asset.url}
                            alt=""
                            sx={{
                              width: 48,
                              height: 48,
                              objectFit: "cover",
                              borderRadius: 1,
                              bgcolor: "background.default",
                            }}
                          />
                        ) : null}
                        <Typography sx={{ wordBreak: "break-word" }}>
                          {asset.public_id}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      {asset.referenced ? "Referenced" : "Unused"}
                    </TableCell>
                    <TableCell>{formatBytes(asset.bytes)}</TableCell>
                    <TableCell>{formatCreatedAt(asset.created_at)}</TableCell>
                  </TableRow>
                ))}
                {!scanResult.assets.length && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography color="text.secondary" textAlign="center">
                        No Cloudinary assets found.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      )}

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Delete selected assets?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete {selectedAssets.length} unused
            Cloudinary assets. Referenced assets are blocked by the backend.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDelete}
            disabled={deleting}
            startIcon={
              deleting ? <CircularProgress size={16} /> : <DeleteIcon />
            }
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
