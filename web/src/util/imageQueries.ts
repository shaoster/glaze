import { useSuspenseQuery } from "@tanstack/react-query";

export const imageLoadQueryOptions = (url: string) => ({
  queryKey: ["image-load", url],
  queryFn: () =>
    new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    }),
  staleTime: Infinity,
});

export function useSuspendedImageLoad(url: string) {
  return useSuspenseQuery(imageLoadQueryOptions(url));
}
