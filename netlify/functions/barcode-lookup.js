// netlify/functions/barcode-lookup.js
// Server-side barcode lookup — no CORS issues

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  const code = (event.queryStringParameters || {}).code || "";
  if (!code) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "No barcode" }) };
  }

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,serving_size,nutriments`,
      { headers: { "User-Agent": "ProvenGroundApp/1.0 (health@provenground.app)" } }
    );

    if (!res.ok) {
      return { statusCode: 404, headers, body: JSON.stringify({ found: false }) };
    }

    const data = await res.json();
    if (data.status !== 1 || !data.product) {
      return { statusCode: 404, headers, body: JSON.stringify({ found: false }) };
    }

    const p = data.product;
    const n = p.nutriments || {};
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        found: true,
        name: p.product_name || "Unknown Product",
        brand: p.brands ? p.brands.split(",")[0].trim() : "",
        serving: p.serving_size || "100g",
        cal:  Math.round(n["energy-kcal_serving"] || n["energy-kcal_100g"]    || 0),
        prot: Math.round((n["proteins_serving"]    || n["proteins_100g"]       || 0) * 10) / 10,
        carb: Math.round((n["carbohydrates_serving"]|| n["carbohydrates_100g"] || 0) * 10) / 10,
        fat:  Math.round((n["fat_serving"]          || n["fat_100g"]           || 0) * 10) / 10,
        fiber:Math.round((n["fiber_serving"]        || n["fiber_100g"]         || 0) * 10) / 10,
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ found: false, error: err.message }) };
  }
};
