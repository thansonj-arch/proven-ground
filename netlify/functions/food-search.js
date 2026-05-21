// netlify/functions/food-search.js
// Runs on Netlify's servers — no CORS restrictions on server-to-server requests
// Called by the app as /.netlify/functions/food-search?q=oikos

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  const q = (event.queryStringParameters || {}).q || "";
  if (!q || q.trim().length < 2) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Query too short" }) };
  }

  const source = (event.queryStringParameters || {}).source || "off";

  try {
    let results = [];

    if (source === "off" || source === "both") {
      // Open Food Facts — full text search via v1 API
      const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=15&fields=product_name,brands,serving_size,nutriments,code&sort_by=unique_scans_n`;
      const offRes = await fetch(offUrl, {
        headers: { "User-Agent": "ProvenGroundApp/1.0 (health@provenground.app)" }
      });
      if (offRes.ok) {
        const offData = await offRes.json();
        const offProducts = (offData.products || [])
          .filter(p => p.product_name && p.nutriments)
          .filter(p => {
            const n = p.nutriments;
            return n["energy-kcal_serving"] || n["energy-kcal_100g"] || n["energy-kcal"] || n["energy_value"];
          })
          .map(p => {
            const n = p.nutriments;
            return {
              source: "off",
              name: p.product_name,
              brand: p.brands ? p.brands.split(",")[0].trim() : "",
              serving: p.serving_size || "100g",
              cal:  Math.round(n["energy-kcal_serving"] || n["energy-kcal_100g"]   || n["energy-kcal"]   || 0),
              prot: Math.round((n["proteins_serving"]    || n["proteins_100g"]      || n["proteins"]      || 0) * 10) / 10,
              carb: Math.round((n["carbohydrates_serving"]|| n["carbohydrates_100g"]||n["carbohydrates"]  || 0) * 10) / 10,
              fat:  Math.round((n["fat_serving"]          || n["fat_100g"]          || n["fat"]           || 0) * 10) / 10,
              fiber:Math.round((n["fiber_serving"]        || n["fiber_100g"]        || n["fiber"]         || 0) * 10) / 10,
              code: p.code || "",
            };
          });
        results = [...results, ...offProducts];
      }
    }

    if ((source === "usda" || source === "both") && results.length < 5) {
      // USDA FoodData Central — good for whole foods and US branded items
      const usdaUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY&query=${encodeURIComponent(q)}&pageSize=10&dataType=Branded,Foundation,SR%20Legacy`;
      const usdaRes = await fetch(usdaUrl);
      if (usdaRes.ok) {
        const usdaData = await usdaRes.json();
        const usdaFoods = (usdaData.foods || [])
          .filter(f => f.description)
          .map(f => {
            const getNutrient = (nums) => {
              for (const num of nums) {
                const found = (f.foodNutrients||[]).find(n => n.nutrientNumber==num || n.nutrientId==num);
                if (found && found.value) return found.value;
              }
              return 0;
            };
            return {
              source: "usda",
              name: f.description,
              brand: f.brandOwner || f.brandName || "",
              serving: f.servingSize ? `${f.servingSize}${f.servingSizeUnit||"g"}` : "100g",
              cal:  Math.round(getNutrient([1008,208])),
              prot: Math.round(getNutrient([1003,203]) * 10) / 10,
              carb: Math.round(getNutrient([1005,205]) * 10) / 10,
              fat:  Math.round(getNutrient([1004,204]) * 10) / 10,
              fiber:Math.round(getNutrient([1079,291]) * 10) / 10,
              code: String(f.fdcId || ""),
            };
          });
        results = [...results, ...usdaFoods];
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ results: results.slice(0, 20) }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message, results: [] }),
    };
  }
};
