/**
 * --------------------------------------------
 *  1) ユニコードエスケープを「1文字」ずつデコードする関数
 *     （サロゲートペア考慮版）
 * --------------------------------------------
 */
function decodeUnicodeEscapesOneChunk(chunk) {
    // chunkが例: "\u3042\u3044" のように連続しているか確かめる
    // 完全にマッチすれば、後で実際にコードポイント配列へ変換する
    // ^(?:\\u[0-9A-Fa-f]{4})+$ で判定
    if (!/^(?:\\u[0-9A-Fa-f]{4})+$/.test(chunk)) {
      return null; // デコード不可の場合は null を返す
    }
  
    // すべての \uXXXX を取り出して数値化
    const pattern = /\\u([0-9A-Fa-f]{4})/g;
    let match;
    const codeUnits = [];
    while ((match = pattern.exec(chunk)) !== null) {
      codeUnits.push(parseInt(match[1], 16));
    }
  
    // サロゲートペアを考慮しながら1つの文字列にまとめる
    const codePoints = [];
    for (let i = 0; i < codeUnits.length; i++) {
      const cu = codeUnits[i];
      // 上位サロゲート
      if (0xd800 <= cu && cu <= 0xdbff) {
        if (i + 1 < codeUnits.length) {
          const next = codeUnits[i + 1];
          if (0xdc00 <= next && next <= 0xdfff) {
            // サロゲートペア成立
            const hi = cu - 0xd800;
            const lo = next - 0xdc00;
            const codePoint = (hi << 10) + lo + 0x10000;
            codePoints.push(codePoint);
            i++; // ペア消費
          } else {
            // 不正下位
            return null;
          }
        } else {
          // 下位がない
          return null;
        }
      }
      // 下位サロゲート単独
      else if (0xdc00 <= cu && cu <= 0xdfff) {
        return null;
      }
      else {
        // 通常BMP内
        codePoints.push(cu);
      }
    }
  
    try {
      return String.fromCodePoint(...codePoints);
    } catch (e) {
      return null;
    }
  }
  
  /**
   * --------------------------------------------
   *  2) 「\uXXXX」形式を含む文字列を、カンマやセミコロンを
   *     区切りとして考慮しながらデコードして返す関数
   *
   *  例:
   *    "\u3042,\u3044;\u3046" -> "あ,い;う"
   * --------------------------------------------
   */
  function decodeWithDelimiters(input) {
    // カンマ(,)やセミコロン(;)をデリミタとして分割しつつ、分割文字も配列で保持
    // 例: "abc,def;ghi" => ["abc", ",", "def", ";", "ghi"]
    // 正規表現 split + キャプチャグループを使う
    const tokens = input.split(/([,;])/);
  
    // 各トークンを判定
    let result = "";
    tokens.forEach((token) => {
      // 区切り文字の場合はそのまま追加
      if (token === "," || token === ";") {
        result += token;
        return;
      }
  
      // 空文字や空白だけのトークンならそのまま（必要に応じて調整）
      if (!token.trim()) {
        result += token;
        return;
      }
  
      // \uXXXX 形式の塊としてデコード可能ならデコード
      const decoded = decodeUnicodeEscapesOneChunk(token);
      if (decoded !== null) {
        // デコード成功 => デコード後の文字列を追加
        result += decoded;
      } else {
        // デコード不可 => トークンそのまま追加
        // 「エラーにならないように」という要望なので、そのまま残す
        result += token;
      }
    });
  
    return result;
  }
  
  /**
   * --------------------------------------------
   *  3) 人間が読める文字列を「\uXXXX」形式に変換する関数
   *     （サロゲートペア考慮版）
   * --------------------------------------------
   */
  function encodeToUnicodeEscapes(str) {
    let result = "";
    for (let i = 0; i < str.length; i++) {
      const codePoint = str.codePointAt(i);
      if (codePoint === undefined) {
        continue;
      }
      if (codePoint > 0xFFFF) {
        // サロゲートペア必要
        const base = codePoint - 0x10000;
        const high = 0xD800 + (base >> 10);
        const low = 0xDC00 + (base & 0x3FF);
        result += "\\u" + high.toString(16).padStart(4, "0");
        result += "\\u" + low.toString(16).padStart(4, "0");
        i++; // サロゲートペア分のインデックス調整
      } else {
        // BMP内
        result += "\\u" + codePoint.toString(16).padStart(4, "0");
      }
    }
    return result;
  }
  
  /**
   * --------------------------------------------
   *  4) 人間が読める文字列を、カンマやセミコロンで
   *     区切ったうえで \uXXXX にエンコードする関数
   *
   *  例:
   *    "あ,い;う" -> "\u3042,\u3044;\u3046"
   *    "A,B;😀C" -> "\u0041,\u0042;\uD83D\uDE00\u0043"
   * --------------------------------------------
   */
  function encodeWithDelimiters(input) {
    // カンマ(,)やセミコロン(;)を区切り文字として分割
    const tokens = input.split(/([,;])/);
  
    let result = "";
    tokens.forEach((token) => {
      // 区切り文字ならそのまま追加
      if (token === "," || token === ";") {
        result += token;
      } else {
        // 区切り以外のテキストは \uXXXX 形式へ変換
        result += encodeToUnicodeEscapes(token);
      }
    });
  
    return result;
  }
  
  // --------------------------------------------
  // DOM 操作部分
  // --------------------------------------------
  const leftArea = document.getElementById("leftArea");
  const rightArea = document.getElementById("rightArea");
  const copyLeftBtn = document.getElementById("copyLeft");
  const copyRightBtn = document.getElementById("copyRight");
  
  // 入力イベントによる循環更新を防ぐフラグ
  let isUpdatingLeft = false;
  let isUpdatingRight = false;
  
  /**
   * 左側のテキストエリア入力 -> 右側を更新
   */
  leftArea.addEventListener("input", () => {
    if (isUpdatingRight) return;
    isUpdatingLeft = true;
  
    // 例: "\u3042,\u3044;\u3046" => "あ,い;う"
    const decoded = decodeWithDelimiters(leftArea.value);
    rightArea.value = decoded;
  
    isUpdatingLeft = false;
  });
  
  /**
   * 右側のテキストエリア入力 -> 左側を更新
   */
  rightArea.addEventListener("input", () => {
    if (isUpdatingLeft) return;
    isUpdatingRight = true;
  
    // 例: "あ,い;う" => "\u3042,\u3044;\u3046"
    const encoded = encodeWithDelimiters(rightArea.value);
    leftArea.value = encoded;
  
    isUpdatingRight = false;
  });
  
  /**
   * コピーボタン
   */
  copyLeftBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(leftArea.value);
  });
  
  copyRightBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(rightArea.value);
  });
  