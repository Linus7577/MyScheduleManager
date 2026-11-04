import type { LineId } from "@/features/game/lines";

/**
 * What the warrior says aloud. Original lines, spoken in Japanese and never shown as text: the screen shows the
 * translation from the messages files. These are the source for generating his voice clips.
 */
export const VOICE_SCRIPT: Record<LineId, string> = {
  r1: "立ち止まるな。お前の刃は、もう鈍らない。",
  r2: "連なる日々が、お前を鍛えた。",
  r3: "恐れるな。敵はもう、お前を恐れている。",
  s1: "言い訳は要らない。次の戦へ行け。",
  s2: "今日という戦場は、一度きりだ。",
  s3: "黙って斬れ。結果は後からついてくる。",
  s4: "休むな、とは言わん。だが、逃げるな。",
  w1: "傷は恥じゃない。倒れたままでいることが恥だ。",
  w2: "まだ剣は握れるだろう。立て。",
  w3: "弱さを認めろ。そして斬り捨てろ。",
  b1: "鎧は砕けた。だが、お前はまだ死んでいない。",
  b2: "どん底か。ならば、あとは這い上がるだけだ。",
  a1: "今日の敵は、すべて斬った。",
  a2: "よくやった。だが、明日も戦は来る。",
  d1: "一つ、斬った。次だ。",
  d2: "悪くない。止まるな。",
  d3: "その調子だ。容赦するな。",
  k1: "逃げた分は、明日取り戻せ。",
  k2: "今の一撃は、お前自身に届いた。",
  l1: "力が増したな。まだ足りん。",
  t1: "その姿に、ふさわしい戦をしろ。",
};

/**
 * Lines the voice engine misreads, spelled out in its pronunciation notation. An apostrophe marks where the pitch
 * falls, and a slash separates phrases. It read 立て as "date", 刃 as "ha", 認めろ as "shitatamero", and ran 戦は
 * together. The others read correctly, but ran words together or stressed them in the wrong place.
 */
export const VOICE_PRONUNCIATION: Partial<Record<LineId, string>> = {
  r1: "タチドマ'ルナ、オマエノ'/ヤイバワ'、モ'オ/ニブラ'ナイ",
  w2: "マ'ダ/ケ'ンワ/ニギレルダロオ'、タ'テ",
  a2: "ヨ'ク/ヤ'ッタ、ダ'ガ、ア_シタ'モ/イ_クサワ'/ク'ル",
  w3: "ヨワ'サオ/ミトメ'ロ、ソ_シテ'/キリ_ステ'ロ",
  b2: "ドンゾコカ'、ナ'ラバ、ア'トワ/ハイアガ'ルダケダ",
  s2: "キョ'オト/イウ'/センジョオワ'、イチドキ'リダ",
};

/** Whether the clips exist in public/audio/voice. Without them he speaks in text only. */
export const VOICE_CLIPS_READY = true;
