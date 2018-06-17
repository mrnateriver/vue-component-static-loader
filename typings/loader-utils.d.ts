declare module "loader-utils" {
  import webpack from "webpack";

  export function getOptions(context: webpack.loader.LoaderContext): object;
}
