import { type Hex } from "viem";

/**
 * Solon curated market list — every tokenized-stock/ETF -> USDG market on Robinhood Chain's Morpho
 * deployment (snapshot generated from CreateMarket events; regenerate when new markets launch).
 * Curation is the product: yield-wrapper, stablecoin-carry, and meme collateral are excluded.
 *
 * Every collateral is ISSUER-VERIFIED on-chain: its EIP-1967 beacon slot must equal Robinhood's
 * official token beacon 0xe10b6f6b275de231345c20d14ab812db62151b00 (all genuine RH stock/ETF
 * tokens share it; a fake "AAPL" cannot forge it). A symbol or logo proves nothing — market
 * creation is permissionless and impostor tokens exist on this chain (one, "AI", was caught and
 * removed by this check). Loan token is always canonical USDG 0x5fc5360d...d168.
 */
export const SOLON_MARKET_IDS: Hex[] = [
  "0x3b788195cc0f5eb987e14d91d9b8875cf742c55faf9822ae25701f71a3ed7133", // AAPL / USDG - lltv 38.5% (SOLON market, our adapter)
  "0x0d6e009807341aae5d0ccc3fbdc506fce77012603e96aec3fc44785942e7cf65", // AAPL / USDG - lltv 62.5%
  "0x30a2a5f1a098b23ed91eadc4529a8d1c967f2cdc2e40a709f3a5992004b01ac0", // AAPL / USDG - lltv 62.5%
  "0x63c71d3a1afd71c674be55f07a27ad783edf20d63372111ae5b2e7162963b7ac", // AAPL / USDG - lltv 62.5%
  "0x6641d1333a00edf42f79b931554f1c81971656f18d881245f9547b471d5a49fb", // AAPL / USDG - lltv 77.0%
  "0xe3813a231ef3c073d21615ab0a8788ebfae23e95e7e5571880c7619d5b05f404", // AAPL / USDG - lltv 77.0%
  "0x01ab931866f6753d9246d451284c03d2b9cdf7f351120bc2e79045941777e7aa", // AAPL / USDG - lltv 86.0%
  "0xd621b5373890ce0be9b20ca17a75c57944e8dbb997172fd61e1ea48af63fad96", // AAPL / USDG - lltv 86.0%
  "0x4d2075836fd32183b10e5be1b383f6430de859df6d2bd5ec5b859970c4dd14e8", // AMD / USDG - lltv 62.5%
  "0x8b2af4d69ad861a4099b995b6279aeaf6a905225a0ee889bce424c7faf19b7d9", // AMZN / USDG - lltv 62.5%
  "0xbe881499e682850931951c998e76cfbf38c7979b1beeae7cbbb97a39b3336a07", // ASML / USDG - lltv 62.5%
  "0xdd578ca54b4ef6a7827c6e9fc06905699a577f6e2f00712853d8aab13383bc38", // BABA / USDG - lltv 62.5%
  "0x8114b65dfc5e64222103e5588de261eca9defd25f47ea4ae2f91d49fe4fa2993", // CLSK / USDG - lltv 62.5%
  "0x508b47fb12dbb8747644d4436aae65489b5f2819936adefc8a591323f64a5b01", // COIN / USDG - lltv 62.5%
  "0xb33399a677e1a21152fa9969f02c57a7a342e692ec45608a3fa0d3d92519c343", // COST / USDG - lltv 38.5%
  "0xf0959f62e748938cf260ca6fe7cb21a412e0a6643913460f4a6770c3f4b90af6", // CRCL / USDG - lltv 62.5%
  "0x7350ef542bf56a7e71f393b49dbce930b360c2ff042fd8af093d6eaedf0ec219", // CRWV / USDG - lltv 62.5%
  "0x96d3d5f9bc842e4c8a935c5628abd02fb0e10115560c35a9add768781434f471", // CRWV / USDG - lltv 62.5%
  "0xd8b502d5c43f6e5cfff7f938c7ef18e684f114fb5b362611981144397e5d5aef", // DELL / USDG - lltv 62.5%
  "0x3be7fe1b6b439cfeb737d9921e9b83c92095a23a4f50aeee0d6d04f44446170f", // DJT / USDG - lltv 38.5%
  "0x1b3555f7c1273688f01ae82da7dc8e508e6a7841ec0038dbb15767154a277b86", // EWY / USDG - lltv 62.5%
  "0x6c12c02536aa27831f713d658b59f74e149cc62b48528cb74455e79fab32f772", // GLD / USDG - lltv 38.5%
  "0x4979137c23c8fb519cd507adc290944c3c2120e8a3191547531fced28360e9c2", // GME / USDG - lltv 62.5%
  "0x686fdee2de161b1abd777e14ca5f5b37e9267e083ee5d6ad2c31dedee27bc95d", // GOOGL / USDG - lltv 62.5%
  "0x6d7da35d1e6b24bdd5a67cb0adbe9eb758d20471b849ba25039f06f48182ac49", // GOOGL / USDG - lltv 62.5%
  "0x7e6ebfdc58a893a5cddba0fba0483baf4fac2efece627ad50821dbe27d6f9738", // GOOGL / USDG - lltv 62.5%
  "0x188ae84afe56b1da5fd161ff6ff879a321d8bb1598dfafc8a74e3f20a8977ee6", // GOOGL / USDG - lltv 77.0%
  "0xfb89cd660644af485ed5eb7dc4fe20623a7934537258c95635ac9a3a87d787fd", // GOOGL / USDG - lltv 77.0%
  "0x325fc8e0610ad5403445c01009e6ab488082a24d61c1dfbd4b8f55184a2eb228", // GOOGL / USDG - lltv 86.0%
  "0x4804ceda06fea535ce9a60253410b41cbcf76fa5e07997488c6e2089c8c68477", // GOOGL / USDG - lltv 86.0%
  "0xda5584635e8b14ea18f674dbe4243365505910fefd8e3aa1ac9bfaac0eba74e8", // INTC / USDG - lltv 62.5%
  "0xc85eb4a69283ad402fbbb96e160416f2015e1ed2cb65484b1a905a5fc117f1d7", // IONQ / USDG - lltv 62.5%
  "0x69400cfe81f2ae381b9a9f27076a4d637338379d999e9ffdfbde52f0876312ee", // META / USDG - lltv 62.5%
  "0xe8d9b45cdbedc4401a3145be7726c9f72b715e03c5399c961439f11636ee9fb6", // MRNA / USDG - lltv 38.5%
  "0xafc86936af4f7edf083eb2550b8c42311b83c685982742b9271b309a58268855", // MSFT / USDG - lltv 62.5%
  "0x01baec96478004fc7b74c8dfe38abef8d716fea59ffd481b6ec74db915d3bc80", // MSTR / USDG - lltv 62.5%
  "0x9df4f54a2e46b35bd326cec97dbabc4203fa6c64a8e4182128f277adba8fefaf", // MU / USDG - lltv 62.5%
  "0xf049167e6bf18a1b41b8e2acefcf7bc9b13ea013d8d65c7fbc7cbaeb3fe9b4e2", // NBIS / USDG - lltv 62.5%
  "0x0066bc47b87597993af0bca6f526175c0abae011b764d4bf12a3def45e1f4e78", // NFLX / USDG - lltv 38.5%
  "0xbe3a53552a5600381ca1d858cc425a2601becbd77c43c753698890a22adbbb0d", // NVDA / USDG - lltv 38.5%
  "0x66306c087add8907752320b309934abcc354d21626de8115c79df49d9c214edc", // NVDA / USDG - lltv 62.5%
  "0xb74600c27a3424eac0a9288f539d5165a125a5102d08b5313c303e29c0eaf8bf", // NVDA / USDG - lltv 62.5%
  "0x21539fb91cac5c218508f89d6bd946eabaeed3b4ff185e802bbb73c2f77c25de", // NVDA / USDG - lltv 77.0%
  "0xd780a699a2022b90fd14e89b61523e6b6b6fdd3833158fcb701b878a5902255f", // NVDA / USDG - lltv 77.0%
  "0x3ce44383b860237d3a78a88caf9edcbec36b040d7be2998ef8222eec8719bd48", // NVDA / USDG - lltv 86.0%
  "0xba2956531697f0c0b0b9db7b2d3148581ae69610c136287ba84bf519621a22dd", // NVDA / USDG - lltv 86.0%
  "0xee04847a312224d551d2267bb5c2c2695777af5fd1f05347bdcca397e8f54336", // ORCL / USDG - lltv 62.5%
  "0xb5ba72c0d55c353fa37c0bea104eb117afb2f4934473bcb736d2218ae5686746", // PLTR / USDG - lltv 62.5%
  "0x315b99abb698487891243a84afd28a5ff56fe02143f203c03edd3f103936bf60", // QQQ / USDG - lltv 62.5%
  "0x3d487a03ed905fd38ccd80ada05730f3ea7745e7dd51c08fdeb4bb0f45c3c0cb", // QQQ / USDG - lltv 77.0%
  "0x8338aed363a309039b2f271a83558831e7e445f2d13c6e72c576ec0b8a969415", // RBLX / USDG - lltv 38.5%
  "0x298e8ff9b31f22be90507bc61b55e66ab93e78b55a60593035e309ed93137cb8", // RDDT / USDG - lltv 38.5%
  "0x003390b057d753bd839981a0d45f9a567aa0b0ed6373fd42e951eac8ee86c2ba", // RGTI / USDG - lltv 62.5%
  "0x46eea143d473cdb8587505f8886dad452037f285f7729a7763e8c233c63b2e8e", // RIVN / USDG - lltv 38.5%
  "0x14973a168cf6c6b1148309f5d567c255b292863ffe9cca59f4284e1426636f00", // RKLB / USDG - lltv 62.5%
  "0xf6f3dbe0a19e948147e79e66502c6b05709d8dfde977fec7db1528fc8f0ebdfa", // SGOV / USDG - lltv 86.0%
  "0x9ecbc985b58baba5a91bbbb5116f6800537236c16df8dfd7ed51deb167f2a0a7", // SGOV / USDG - lltv 91.5%
  "0x123796e4c218eddcb445a8900ee5986dd6439b7d1e91cbcacb1fbfc827e10291", // SLV / USDG - lltv 62.5%
  "0x4edbd2f2f3b33bc5f80ab588def67fab8c10945fc99f855d80ff4bef2c4aa1f0", // SLV / USDG - lltv 62.5%
  "0x74fece475178af9e06d31fb64f405046a305f8f0abc588782f596d6f261c1fbb", // SNDK / USDG - lltv 62.5%
  "0x50bc39b5722fb5634c436d74c6787f3c125b879e7b73cf9e9ecc01bbb57b8e55", // SPY / USDG - lltv 62.5%
  "0xc40e93b78f25c887d184c4f5c8797db157752f79948a6a51d747147a22531e9b", // SPY / USDG - lltv 62.5%
  "0x077088f9ae5f5c1d35439ee68f4bdbb176368a1a73fd4c8cb8e004143d0c5c30", // SPY / USDG - lltv 77.0%
  "0x90b439eeec826e243629556331f016ad85cb3addf558c0bff76f3a52b3266545", // SPY / USDG - lltv 77.0%
  "0xc000f9a159a0701664cbebb99dc746f8c456e92fc720e797bd445124704c009d", // SPY / USDG - lltv 77.0%
  "0xc78a7b86f102a8a5ead69355beecaa20f726de9530c6fe193429bd4ee29300f6", // SPY / USDG - lltv 86.0%
  "0xe4f745e6620e169ee2664111e61e448d2e0d58ea0129fd5fb0db940f5e0f801b", // SPY / USDG - lltv 86.0%
  "0x90cfa614aa677da7d08655f5efd6dbb6e1ab75349a9fb6e8385c6673c1e1a42d", // TSLA / USDG - lltv 62.5%
  "0xb41b34c5989420ad080e79363a9cfe3e23bec7459fcd2d88029250da370288df", // TSLA / USDG - lltv 62.5%
  "0x173aa178280d8df45242d82a6ed72c8a3e8dc494ab5264045bd986146ab5e613", // TSLA / USDG - lltv 77.0%
  "0xf4dff250826a86627545e5c6594b3b249db3ad2ec5eed56c02833d2a67acf445", // TSLA / USDG - lltv 77.0%
  "0xfa83733bf91efe91c9ef2ff56ab4ff6dcd3ef7c90e55f20ae7e88070e0b84634", // TSLA / USDG - lltv 77.0%
  "0x2cedec528cb3c02b27986d8e2e1cefb35d1ee39ceb268f2e0c4e55179224216d", // TSLA / USDG - lltv 86.0%
  "0xc6a3f6238a3ac2db25af6a392ba974087717bc837e00dc7177172999b85afd5f", // TSLA / USDG - lltv 86.0%
  "0x243ac165f79a75a0590d2e994ffa9e260b70292fd1ca134ace95f3640895b19f", // TSM / USDG - lltv 62.5%
  "0x2ab6a14c9f68d4216dcb3b4e6ed607cf82f2e6badfa2bd5618d7f69d012d7fab", // USAR / USDG - lltv 38.5%
  "0x6b8a1f62d88d1cd1e8de609aef07cafc8226172ba703e57c52c3730350e61df1", // USO / USDG - lltv 62.5%
];
// Solon's own deployment (genesis 2026-09-03).
export const SOLON_VAULT = {
  address: "0xCBB61788fB5A1969C93A222B1a12E4D1A50c6d99" as const,
  adapter: "0x00e53F320C446d00188D45f415EA71304e419C92" as const,
  owner: "0xD0340F008bee8F6101cD609E0447cd3d44f8cC84" as const,
  performanceFeeWad: 150000000000000000n, // 15%
};

// Markets created and certified by Solon (our oracle adapter + conservative LLTV).
export const SOLON_CREATED_MARKETS: Hex[] = [
  "0x3b788195cc0f5eb987e14d91d9b8875cf742c55faf9822ae25701f71a3ed7133", // AAPL/USDG 38.5%
];
