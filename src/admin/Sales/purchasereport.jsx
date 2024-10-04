import React, { useState, useEffect } from "react";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import ImageWithBasePath from "../../core/img/imagewithbasebath";
import {
  Calendar,
  PlusCircle,
  ChevronUp
} from "feather-icons-react/build/IconComponents";
import { DatePicker } from "antd";
import { fetchPurchases } from "../../Data/Inventario/purchases";
import Table from "../../core/pagination/datatable";
import AddPurchases from "../../core/modals/purchases/addpurchases";
import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";
import { setToogleHeader } from "../../core/redux/action";

const PurchaseOrderReport = () => {
  const [filteredData, setFilteredData] = useState([]);
  const [dataSource, setDataSource] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedDate1, setSelectedDate1] = useState(null);
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    const loadProducts = async () => {
      const products = await fetchPurchases();
      setDataSource(products);
      setFilteredData(products);
    };
    loadProducts();
  }, []);

  const dispatch = useDispatch();
  const data = useSelector((state) => state.toggle_header);
  const handleDateChange = (date) => {
    setSelectedDate(date);
    setSelectedDate1(null); // Reinicia la fecha final seleccionada
  };
  const disabledEndDate = (current) => {
    return selectedDate && current && current < selectedDate.startOf("day");
  };
  const handlePdfDownload = () => {
    const columns = [
      { header: "Fecha de Compra", dataKey: "datepurchase" },
      { header: "Nombre", dataKey: "Name" },
      { header: "Cantidad", dataKey: "Cantidad" },
      { header: "Total", dataKey: "total" },
      { header: "Vendedor Responsable", dataKey: "createdby" }
    ];

    // Obtiene la fecha actual para incluir en el nombre del archivo
    const today = new Date();
    const formattedDate = today.toISOString().slice(0, 10); // yyyy-mm-dd

    // Crea un nuevo documento PDF
    const doc = new jsPDF();

    // Usa autotable para agregar la tabla al documento
    doc.autoTable({
      columns: columns,
      body: dataSource.map((data) => ({
        datepurchase: data.datepurchase,
        Name: data.Name,
        Cantidad: data.Cantidad,
        total: data.total,
        createdby: data.createdby
      })),
      styles: { halign: "center" }, // Opcional: centrar el contenido
      headStyles: { fillColor: [233, 30, 99] } // Opcional: color de la cabecera
    });

    // Guarda el PDF con el nombre que incluye la fecha
    const fileName = `Inventario_${formattedDate}.pdf`;
    doc.save(fileName);
  };

  const handleExcelExport = () => {
    // Define las columnas que quieres usar en el archivo Excel
    const columns = [
      { title: "Fecha de Compra", dataIndex: "datepurchase" },
      { title: "Nombre", dataIndex: "Name" },
      { title: "Cantidad", dataIndex: "Cantidad" },
      { title: "Total", dataIndex: "total" },
      { title: "Vendedor Responsable", dataIndex: "createdby" }
    ];

    // Extrae las filas de datos basadas en dataSource
    const data = dataSource.map((item) =>
      columns.map((col) => item[col.dataIndex])
    );

    // Prepara los encabezados del archivo Excel
    const headers = columns.map((col) => col.title);
    // Combina los encabezados y los datos
    const sheetData = [headers, ...data];

    // Crea la hoja de cálculo
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

    // Crea y descarga el archivo Excel
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Ventas");
    const today = new Date();
    const formattedDate = today.toISOString().slice(0, 10); // yyyy-mm-dd

    // Incluye la fecha en el nombre del archivo
    const fileName = `Reporte_Ventas_${formattedDate}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const handlePrint = () => {
    window.print();
    console.log("Contenido impreso");
  };
  const handleSearchChange = (event) => {
    const value = event.target.value;
    setSearchValue(value);

    // Filtrar los productos en base al término de búsqueda
    const filtered = dataSource.filter((product) =>
      product.product.toLowerCase().includes(value.toLowerCase())
    );
    setFilteredData(filtered);
  };

  const handleDateChange1 = (date) => {
    setSelectedDate1(date);
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
  const columns = [
    {
      title: "Fecha de Compra",
      dataIndex: "datepurchase",
      sorter: (a, b) => new Date(a.datepurchase) - new Date(b.datepurchase)
    },
    {
      title: "Nombre",
      dataIndex: "Name",
      sorter: (a, b) => a.Name.length - b.Name.length
    },

    {
      title: "Cantidad",
      dataIndex: "total",
      sorter: (a, b) => a.qty - b.qty
    },
    {
      title: "Total",
      dataIndex: "total",
      sorter: (a, b) => a.total - b.total
    },
    {
      title: "Vendedor Responsable",
      dataIndex: "createdby",
      sorter: (a, b) => a.createdby.length - b.createdby.length
    }
  ];
  return (
    <div>
      <div className="page-wrapper">
        <div className="content">
          <div className="page-header">
            <div className="add-item d-flex">
              <div className="page-title">
                <h4>Egresos</h4>
                <h6>Gestiona tus egresos</h6>
              </div>
            </div>
            <ul className="table-top-head">
              <li>
                <OverlayTrigger placement="top" overlay={renderTooltip}>
                  <Link onClick={handlePdfDownload}>
                    <ImageWithBasePath
                      src="assets/img/icons/pdf.svg"
                      alt="img"
                    />
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
                      dispatch(setToogleHeader(!data));
                    }}
                    className={data ? "active" : ""}
                  >
                    <ChevronUp />
                  </Link>
                </OverlayTrigger>
              </li>
            </ul>
            <div className="page-btn">
              <Link
                to="#"
                className="btn btn-added"
                data-bs-toggle="modal"
                data-bs-target="#add-units"
              >
                <PlusCircle className="me-2" />
                Añadir Compra
              </Link>
            </div>
          </div>
          {/* /product list */}
          <div className="card">
            <div className="card-body">
              <div className="table-top">
                <div className="search-set">
                  <div className="search-input">
                    <input
                      type="text"
                      placeholder="Search"
                      className="form-control form-control-sm formsearch"
                      onChange={handleSearchChange}
                      value={searchValue}
                    />
                    <Link to className="btn btn-searchset">
                      <i data-feather="search" className="feather-search" />
                    </Link>
                  </div>
                </div>
                <div className="card-body pb-0">
                  <div className="row">
                    <div className="row justify-content-end">
                      <div className="col-lg-4 col-sm-6 col-12 ms-auto">
                        <div className="input-blocks">
                          <div className="input-groupicon">
                            <Calendar className="info-img" />
                            <DatePicker
                              selected={selectedDate}
                              onChange={handleDateChange}
                              type="date"
                              className="filterdatepicker"
                              dateFormat="dd-MM-yyyy"
                              placeholder="Fecha Inicial"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="col-lg-4 col-sm-6 col-12 ms-auto">
                        <div className="input-blocks">
                          <div className="input-groupicon">
                            <Calendar className="info-img" />
                            <DatePicker
                              selected={selectedDate1}
                              onChange={handleDateChange1}
                              type="date"
                              className="filterdatepicker"
                              dateFormat="dd-MM-yyyy"
                              placeholder="Fecha Final"
                              disabledDate={disabledEndDate}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="col-lg-3 col-sm-6 col-12 ms-auto">
                        <div className="input-blocks">
                          <Link className="btn btn-filters">
                            <i
                              data-feather="search"
                              className="feather-search"
                            />{" "}
                            Search
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="table-responsive">
                <div className="table-responsive">
                  <Table columns={columns} dataSource={filteredData} />
                </div>
              </div>
            </div>
          </div>
          {/* /product list */}
        </div>
      </div>
      <AddPurchases />
    </div>
  );
};

export default PurchaseOrderReport;
