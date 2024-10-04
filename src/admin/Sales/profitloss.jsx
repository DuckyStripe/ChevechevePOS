import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import { Link } from "react-router-dom";
import { ChevronUp, Calendar } from "feather-icons-react/build/IconComponents";
import Select from "react-select";
import {
  fetchProfitsYear,
  fetchProfitsMonthsAvailable,
  fetchProfitsYears,
  fetchProfitsMonths
} from "../../Data/Inventario/profits";
import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";
import ImageWithBasePath from "../../core/img/imagewithbasebath";
import { setToogleHeader } from "../../core/redux/action";
import "../../style//css/table.css";

const ProfitLoss = () => {
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [fetchedData, setFetchedData] = useState({
    months: [],
    finances: { income: [] }
  });
  const [availableYears, setAvailableYears] = useState([]);
  const [availableMonths, setAvailableMonths] = useState([]);

  useEffect(() => {
    const initializeData = async () => {
      const years = await fetchProfitsYears();
      setAvailableYears(years);

      if (years.length > 0) {
        // Use the most recent year by default
        const latestYear = years[years.length - 1];
        setSelectedYear(latestYear);

        const data = await fetchProfitsYear(latestYear.value);
        console.log("Datos Año:", data);
        setFetchedData(data);

        const months = await fetchProfitsMonthsAvailable(latestYear.value);
        setAvailableMonths(months);
      }
    };
    initializeData();
  }, []);

  const handleYearChange = async (selectedOption) => {
    if (!selectedOption) return;

    // Resetear el mes seleccionado y los datos
    setSelectedMonth(null);
    console.log("Año Seleccionado:", selectedOption.value);

    const year = selectedOption.value;
    setSelectedYear(selectedOption);

    // Obtiene los meses disponibles para el año seleccionado
    const months = await fetchProfitsMonthsAvailable(year);
    setAvailableMonths(months);

    // Recarga los datos del año y reinicia la tabla
    const data = await fetchProfitsYear(year);
    console.log("Datos Año:", data);
    setFetchedData(data);
  };

  const handleMonthChange = async (selectedOption) => {
    if (!selectedOption) return;

    console.log(
      "año",
      selectedYear ? selectedYear.value : "N/A",
      "mes",
      selectedOption.value
    );

    setSelectedMonth(selectedOption);

    // Utiliza directamente el valor de selectedOption
    if (selectedYear && selectedOption) {
      console.log(selectedYear, selectedOption);
      console.log("entro al if");
      const data = await fetchProfitsMonths(
        selectedYear.value,
        selectedOption.value
      );
      console.log("Datos Meses:", data);
      setFetchedData(data);
    }
  };

  const dispatch = useDispatch();
  const data = useSelector((state) => state.toggle_header);

  const handlePdfDownload = () => {
    const doc = new jsPDF({ orientation: "landscape" }); // Establecer la orientación a landscape
  
    // Añade título y metadatos
    doc.setFontSize(16);
    doc.text("Reporte de Ganancias y Pérdidas", 20, 10);
    doc.setFontSize(10);
    doc.text("Generado desde la aplicación Ganancias y Pérdidas", 20, 15);
  
    // Define las columnas basadas en la estructura de la tabla
    const columns = [
      { header: "Categoría", dataKey: "category" },
      ...fetchedData.months.map((month) => ({ header: month, dataKey: month }))
    ];
  
    // Prepara los datos alineados con la tabla
    const incomeData = fetchedData.finances.income.map((income) => {
      const row = { category: income.category };
      fetchedData.months.forEach((month, index) => {
        row[month] = income.values[index] !== undefined ? income.values[index] : 0;
      });
      return row;
    });
  
    // Añade título para "Entradas"
    doc.setFontSize(14);
    doc.text("Entradas y Salidas", doc.internal.pageSize.getWidth() / 2, 30, {
      align: "center"
    });
  
    // Usa autotable para agregar las tablas de "Entradas" al documento
    doc.autoTable({
      head: [columns.map((col) => col.header)],
      body: incomeData.map((data) => columns.map((col) => data[col.dataKey])),
      startY: 40,
      margin: { top: 20 }
    });
  
    // Guarda el PDF
    const today = new Date();
    const formattedDate = today.toISOString().slice(0, 10); // yyyy-mm-dd
    const fileName = `Reporte_Financiero_${formattedDate}.pdf`;
    doc.save(fileName);
  };
  
  const handleExcelExport = () => {
    // Define encabezados para "Entradas" y "Salidas"
    const headers = ["Categoría", ...fetchedData.months];
  
    // Datos para "Entradas"
    const incomeData = fetchedData.finances.income.map((income) => [
      income.category,
      ...income.values.map((value) => (value !== undefined ? value : 0))
    ]);
  
    // Combina metadatos, título, y datos
    const sheetData = [
      ["Reporte de Ganancias y Pérdidas"],
      ["Generado desde la aplicación Ganancias y Pérdidas"],
      [],
      ["Entradas y Salidas"],
      headers,
      ...incomeData
    ];
  
    // Crea la hoja de cálculo
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Ganancias y Pérdidas");
  
    // Guarda el archivo Excel
    const today = new Date();
    const formattedDate = today.toISOString().slice(0, 10);
    const fileName = `Reporte_Financiero_${formattedDate}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };
  


  const handlePrint = () => {
    window.print();
    console.log("Contenido impreso");
  };

  const renderTooltip = (props) => (
    <Tooltip id="pdf-tooltip" {...props}>
      Pdf
    </Tooltip>
  );
  const renderExcelTooltip = (props) => (
    <Tooltip id="excel-tooltip" {...props}>
      Excel
    </Tooltip>
  );
  const renderPrinterTooltip = (props) => (
    <Tooltip id="printer-tooltip" {...props}>
      Printer
    </Tooltip>
  );

  const renderCollapseTooltip = (props) => (
    <Tooltip id="collapse-tooltip" {...props}>
      Collapse
    </Tooltip>
  );

  return (
    <div className="page-wrapper">
      <div className="content">
        <div className="page-header">
          <div className="add-item d-flex">
            <div className="page-title">
              <h4>Ganancias y Perdidas</h4>
              <h6>Gestiona las ganancias y gastos de tu empresas</h6>
            </div>
          </div>
          <ul className="table-top-head">
            <li>
              <OverlayTrigger placement="top" overlay={renderTooltip}>
                <Link onClick={handlePdfDownload}>
                  <ImageWithBasePath src="assets/img/icons/pdf.svg" alt="img" />
                </Link>
              </OverlayTrigger>
            </li>
            <li>
              <OverlayTrigger placement="top" overlay={renderExcelTooltip}>
                <Link onClick={handleExcelExport}>
                  <ImageWithBasePath
                    src="assets/img/icons/excel.svg"
                    alt="img"
                  />
                </Link>
              </OverlayTrigger>
            </li>
            <li>
              <OverlayTrigger placement="top" overlay={renderPrinterTooltip}>
                <Link onClick={handlePrint}>
                  <i data-feather="printer" className="feather-printer" />
                </Link>
              </OverlayTrigger>
            </li>
            <li>
              <OverlayTrigger placement="top" overlay={renderCollapseTooltip}>
                <Link
                  onClick={(e) => {
                    e.preventDefault();
                    dispatch(setToogleHeader(!fetchedData));
                  }}
                  className={data ? "active" : ""}
                >
                  <ChevronUp />
                </Link>
              </OverlayTrigger>
            </li>
          </ul>
        </div>
        <div className="card table-list-card border-0 mb-0">
          <div className="card-body mb-2">
            <div className="table-top mb-0 profit-table">
              <div className="profit-head ">
                <div className="row ">
                  {" "}
                  {/* Centrado por columna */}
                  <div className="col-lg-4 col-md-6 col-sm-8 col-10 ms-auto m-lg-1">
                    <div className="input-blocks mb-3">
                      <div className="form-sort d-flex align-items-center">
                        <Calendar className="info-img me-2" />{" "}
                        {/* Espacio entre imagen y select */}
                        <Select
                          className="img-select"
                          classNamePrefix="react-select"
                          options={availableYears}
                          value={selectedYear}
                          placeholder="Año"
                          onChange={handleYearChange}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="col-lg-4 col-md-6 col-sm-8 col-10 m-lg-1">
                    <div className="input-blocks mb-3">
                      <div className="form-sort d-flex align-items-center">
                        <Calendar className="info-img me-2" />
                        <Select
                          isDisabled={!selectedYear}
                          className="img-select"
                          classNamePrefix="react-select"
                          options={availableMonths}
                          value={selectedMonth} // Asegura que el valor refleje el estado actual
                          placeholder="Mes"
                          onChange={handleMonthChange}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="table-responsive mt-2">
          <table className="table profit-table">
            <thead className="profit-table-bg">
              <tr>
                <th className="no-sort"></th>
                {fetchedData.months.map((month) => (
                  <th key={month}>{month}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fetchedData.finances.income.map((item, index, array) => (
                <tr
                  className="table-heading"
                  key={`income-${index}`}
                  style={
                    index === array.length - 1 ? { fontWeight: "bold" } : {}
                  }
                >
                  <td>{item.category}</td>
                  {item.values.map((value, i) => (
                    <td key={`income-${index}-value-${i}`}>
                      ${value.toLocaleString()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ProfitLoss;
