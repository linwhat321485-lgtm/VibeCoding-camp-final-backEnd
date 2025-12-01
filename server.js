require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * 取得所有縣市的天氣預報 (36小時)
 * CWA 資料集 F-C0032-001
 */
const getAllCitiesWeather = async (req, res) => {
  try {
    // 檢查是否有設定 API Key
    if (!CWA_API_KEY) {
      return res.status(500).json({
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    // 呼叫 CWA API - 一般天氣預報（36小時）
    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-001`,
      {
        params: {
          Authorization: CWA_API_KEY,
          // *** 關鍵修改：移除 locationName 參數，以取得所有縣市資料 ***
          // locationName: "", // 保持預設，取得所有地點
        },
      }
    );

    // *** 關鍵修改：不再只取第一個 location，而是取得所有 location 的陣列 ***
    const allLocationsData = response.data.records.location;

    if (!allLocationsData || allLocationsData.length === 0) {
      return res.status(404).json({
        error: "查無資料",
        message: "無法取得任何縣市天氣資料",
      });
    }

    // 整理所有縣市的天氣資料
    const formattedData = allLocationsData.map((locationData) => {
      const weatherData = {
        city: locationData.locationName,
        // updateTime 和 datasetDescription 屬於整個資料集，通常保持不變
        forecasts: [],
      };

      // 解析天氣要素
      const weatherElements = locationData.weatherElement;
      // 假設所有 weatherElement 的 time 長度都一樣
      const timeCount = weatherElements[0].time.length;

      for (let i = 0; i < timeCount; i++) {
        const forecast = {
          startTime: weatherElements[0].time[i].startTime,
          endTime: weatherElements[0].time[i].endTime,
          weather: "",
          rain: "",
          minTemp: "",
          maxTemp: "",
          comfort: "",
          windSpeed: "",
        };

        weatherElements.forEach((element) => {
          const value = element.time[i].parameter;
          switch (element.elementName) {
            case "Wx":
              forecast.weather = value.parameterName;
              break;
            case "PoP":
              forecast.rain = value.parameterName + "%";
              break;
            case "MinT":
            case "T": // 有些資料集可能用 T 表示溫度
              forecast.minTemp = value.parameterName + "°C";
              break;
            case "MaxT":
              forecast.maxTemp = value.parameterName + "°C";
              break;
            case "CI":
              forecast.comfort = value.parameterName;
              break;
            case "WS":
              forecast.windSpeed = value.parameterName;
              break;
          }
        });
        weatherData.forecasts.push(forecast);
      }

      return weatherData; // 回傳單一縣市的整理結果
    }); // map 結束

    res.json({
      success: true,
      updateTime: response.data.records.datasetDescription, // 資料集描述通常包含更新時間
      data: formattedData, // 包含所有縣市的陣列
    });
  } catch (error) {
    console.error("取得天氣資料失敗:", error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        error: "CWA API 錯誤",
        message: error.response.data.message || "無法取得天氣資料",
        details: error.response.data,
      });
    }

    res.status(500).json({
      error: "伺服器錯誤",
      message: "無法取得天氣資料，請稍後再試",
    });
  }
};

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "歡迎使用 CWA 天氣預報 API",
    endpoints: {
      allCities: "/api/weather/all", // *** 路徑名稱更改 ***
      health: "/api/health",
    },
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 取得所有縣市天氣預報
app.get("/api/weather/all", getAllCitiesWeather); // *** 路由名稱更改 ***

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "伺服器錯誤",
    message: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "找不到此路徑",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器運行已運作`);
  console.log(`📍 環境: ${process.env.NODE_ENV || "development"}`);
});