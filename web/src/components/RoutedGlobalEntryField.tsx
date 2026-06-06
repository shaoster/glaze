import { useInRouterContext } from "react-router-dom";
import { useGlobalFieldRouting } from "../routing/pieceRouting";
import GlobalEntryField, { type GlobalEntryFieldProps } from "./GlobalEntryField";

interface RoutedGlobalEntryFieldProps extends Omit<GlobalEntryFieldProps, "routing"> {
  pieceId: string;
  // fieldName uniquely identifies this field in the URL. Defaults to globalName
  // but must be set explicitly when multiple fields on the same state reference
  // the same globalName (e.g. "current_location" and "kiln_location" both
  // reference globalName "location").
  fieldName?: string;
}

// Inner component so useGlobalFieldRouting is always called unconditionally.
function RoutedGlobalEntryFieldInner({
  pieceId,
  fieldName,
  globalName,
  ...props
}: RoutedGlobalEntryFieldProps) {
  const routing = useGlobalFieldRouting(pieceId, fieldName ?? globalName);
  return <GlobalEntryField {...props} globalName={globalName} routing={routing} />;
}

// When rendered outside a Router context (e.g. Django admin), fall back to
// the unrouted GlobalEntryField so admin forms still work.
export default function RoutedGlobalEntryField({
  pieceId,
  fieldName,
  ...rest
}: RoutedGlobalEntryFieldProps) {
  const inRouter = useInRouterContext();
  if (!inRouter) {
    return <GlobalEntryField {...rest} />;
  }
  return <RoutedGlobalEntryFieldInner pieceId={pieceId} fieldName={fieldName} {...rest} />;
}
