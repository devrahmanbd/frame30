import Lake
open Lake DSL

package "framique_verification" where
  version := v!"1.0.0"

lean_lib «Framique» where
  roots := #[`Framique.Pricing]
