import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as pathwayApi from "../api/pathwayApi";
import type { PathwayCreate } from "../types/pathway";

export function usePathways() {
  return useQuery({
    queryKey: ["pathways"],
    queryFn: pathwayApi.fetchPathways,
  });
}

export function useCreatePathway() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PathwayCreate) => pathwayApi.createPathway(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pathways"] });
    },
  });
}
