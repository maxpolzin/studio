// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { downloadFiles } from "@foxglove/studio-base/util/download";
import { formatTimeRaw } from "@foxglove/studio-base/util/time";

import { DataSet, Datum, PlotXAxisVal } from "./internalTypes";

function getCSVRow(label: string | undefined, data: Datum) {
  const { x, value, receiveTime, headerStamp } = data;
  const receiveTimeFloat = formatTimeRaw(receiveTime);
  const stampTime = headerStamp ? formatTimeRaw(headerStamp) : "";
  return [x, receiveTimeFloat, stampTime, label, value];
}

const getCVSColName = (xAxisVal: PlotXAxisVal): string => {
  return {
    timestamp: "elapsed time",
    index: "index",
    custom: "x value",
    currentCustom: "x value",
  }[xAxisVal];
};

function generateCSV(datasets: DataSet[], xAxisVal: PlotXAxisVal): string {
  const headLine = [getCVSColName(xAxisVal), "receive time", "header.stamp", "topic", "value"];
  const combinedLines = [];
  combinedLines.push(headLine);
  for (const dataset of datasets) {
    for (const datum of dataset.data) {
      combinedLines.push(getCSVRow(dataset.label, datum));
    }
  }
  return combinedLines.join("\n");
}

function downloadCSV(datasets: DataSet[], xAxisVal: PlotXAxisVal): void {
  const csvData = generateCSV(datasets, xAxisVal);
  const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
  downloadFiles([{ blob, fileName: `plot_data.csv` }]);
}


function generateSVG(datasets: DataSet[]): string {
  const svgWidth = 500;
  const svgHeight = 500;
  const margin = 40;
  const tickSize = 5;
  const maxPoints = 1000;

  let svgData = `
    <?xml version="1.0" encoding="UTF-8" standalone="no"?>
    <svg
      width="${svgWidth}"
      height="${svgHeight}"
      version="1.1"
      id="svg6"
      xmlns="http://www.w3.org/2000/svg"
      xmlns:svg="http://www.w3.org/2000/svg">
      <defs id="defs10" />`;

  // Calculate data range
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;

  for (const dataset of datasets) {
    const xData = dataset.data.map((datum) => datum.x);
    const yData = dataset.data.map((datum) => datum.y);
    xMin = Math.min(xMin, ...xData);
    xMax = Math.max(xMax, ...xData);
    yMin = Math.min(yMin, ...yData);
    yMax = Math.max(yMax, ...yData);
  }

  // Calculate scaling factors
  const xScale = (svgWidth - margin * 2) / (xMax - xMin);
  const yScale = (svgHeight - margin * 2) / (yMax - yMin);

    // Generate x-axis
    const xAxis = `
    <line
      x1="${margin}"
      y1="${svgHeight - margin}"
      x2="${svgWidth - margin}"
      y2="${svgHeight - margin}"
      style="stroke:#000000;stroke-width:1" />
    <text
      x="${svgWidth / 2}"
      y="${svgHeight - 5}"
      text-anchor="middle"
      dominant-baseline="hanging"
      style="fill:#000000;font-size:12px">x</text>`;

  // Generate x-axis ticks and labels
  const xTicks = [];
  const xTickSize = (svgWidth - margin * 2) / 10;
  for (let i = 0; i <= 10; i++) {
    const xPos = margin + i * xTickSize;
    xTicks.push(`
      <line
        x1="${xPos}"
        y1="${svgHeight - margin}"
        x2="${xPos}"
        y2="${svgHeight - margin + tickSize}"
        style="stroke:#000000;stroke-width:1" />
      <text
        x="${xPos}"
        y="${svgHeight - margin + tickSize + 10}"
        text-anchor="middle"
        dominant-baseline="hanging"
        style="fill:#000000;font-size:12px">${(xMin + (xMax - xMin) * (i / 10)).toFixed(1)}</text>`);
  }
  svgData += xAxis + xTicks.join("");

  // Generate y-axis
  const yAxis = `
    <line
      x1="${margin}"
      y1="${margin}"
      x2="${margin}"
      y2="${svgHeight - margin}"
      style="stroke:#000000;stroke-width:1" />
    <text
      x="5"
      y="${svgHeight / 2}"
      text-anchor="start"
      dominant-baseline="middle"
      style="fill:#000000;font-size:12px;transform:rotate(-90deg);transform-origin:5px ${svgHeight / 2}px;">y</text>`;

  // Generate y-axis ticks and labels
  const yTicks = [];
  const yTickSize = (svgHeight - margin * 2) / 10;
  for (let i = 0; i <= 10; i++) {
    const yPos = svgHeight - margin - i * yTickSize;
    yTicks.push(`
      <line
        x1="${margin - tickSize}"
        y1="${yPos}"
        x2="${margin}"
        y2="${yPos}"
        style="stroke:#000000;stroke-width:1" />
      <text
        x="${margin - tickSize - 5}"
        y="${yPos}"
        text-anchor="end"
        dominant-baseline="middle"
        style="fill:#000000;font-size:12px">${(yMin + (yMax - yMin) * (i / 10)).toFixed(2)}</text>`);
  }

  svgData += yAxis + yTicks.join("");


  // Generate path for each dataset
  for (const dataset of datasets) {
    const dataPoints = dataset.data.length;
    const resampleFactor = Math.ceil(dataPoints / maxPoints);
    const resampledData = dataset.data.filter((_, index) => index % resampleFactor === 0);

    const pathData = resampledData
      .map(
        (data) => `${margin + (data.x - xMin) * xScale},${svgHeight - margin - (data.y - yMin) * yScale}`
      )
      .join(" ");

    svgData += `
      <path
        style="opacity:0.712203;fill:none;stroke:#000000;stroke-width:2px;stop-color:#000000"
        d="M${pathData}" />`;
  }

  svgData += `
    </svg>`;
  return svgData;
}


function downloadSVG(datasets: DataSet[]): void {
  const svgData = generateSVG(datasets);
  const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8;" });
  downloadFiles([{ blob, fileName: `plot_data.svg` }]);
}

export { downloadCSV, downloadSVG, generateCSV };
