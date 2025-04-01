import {
  Abi,
  AbiItemName,
  ContractFunctionArgs,
  ContractFunctionName,
  ExtractAbiFunctionForArgs,
  getAbiItem,
  GetAbiItemParameters,
} from "viem";

type ZipToObject<T extends readonly { name?: string }[], V extends readonly unknown[]> = T extends readonly [
  infer Head,
  ...infer RestT,
]
  ? V extends readonly [infer HeadValue, ...infer RestV]
    ? Head extends { name?: infer N }
      ? N extends string
        ? { [K in N]: HeadValue } & ZipToObject<
            RestT extends readonly { name?: string }[] ? RestT : [],
            RestV extends readonly unknown[] ? RestV : []
          >
        : ZipToObject<
            RestT extends readonly { name?: string }[] ? RestT : [],
            RestV extends readonly unknown[] ? RestV : []
          >
      : ZipToObject<
          RestT extends readonly { name?: string }[] ? RestT : [],
          RestV extends readonly unknown[] ? RestV : []
        >
    : object
  : object;

function zipParams<T extends readonly { readonly name?: string }[], V extends readonly unknown[]>(
  params: T,
  values: V,
): ZipToObject<T, V> {
  return params.reduce(
    (acc, param, index) => {
      return typeof param.name === "string" ? { ...acc, [param.name]: values[index] } : acc;
    },
    {} as ZipToObject<T, V>,
  );
}

export function restructure<
  abi extends Abi,
  name extends ContractFunctionName<abi, "view" | "pure">,
  args extends ContractFunctionArgs<abi, "view" | "pure", name>,
  outputs extends readonly unknown[],
>(outputs: outputs, parameters: GetAbiItemParameters<abi, name extends AbiItemName<abi> ? name : never, args>) {
  const x = getAbiItem(parameters);
  switch (x?.type) {
    case "function": {
      if (x.outputs.some((output) => output.name === undefined)) {
        throw new Error(`Attempted to restructure return values lacking names in ABI ${parameters.args!} ${x.outputs}`);
      }
      return zipParams(x.outputs as ExtractAbiFunctionForArgs<abi, "view" | "pure", name, args>["outputs"], outputs);
    }
    default:
      throw new Error(`Attempted to restructure return values for non-function type ${x}`);
  }
}
