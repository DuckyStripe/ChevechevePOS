import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import ImageWithBasePath from "../../core/img/imagewithbasebath";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import Table from "../../core/pagination/datatable";
import { setToogleHeader } from "../../core/redux/action";
import { fetchSales } from "../../Data/Inventario/Sales"; // Importa la función del mockselectedCategory
import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";
import ViewSale from "../../core/modals/inventory/ViewSale";
import { Calendar, ChevronUp } from "feather-icons-react/build/IconComponents";
// Iconos
import { DatePicker } from "antd";

const SalesReport = () => {
  const [dataSource, setDataSource] = useState([]);
  const [searchValue, setSearchValue] = useState(""); // Estado para el término de búsqueda
  const [filteredData, setFilteredData] = useState([]); // Para almacenar datos filtrados
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedDate1, setSelectedDate1] = useState(null);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  useEffect(() => {
    const loadProducts = async () => {
      const products = await fetchSales();
      setDataSource(products);
      setFilteredData(products);
    };
    loadProducts();
  }, []);
  const handleDateChange = (date) => {
    setSelectedDate(date);
    setSelectedDate1(null); // Reinicia la fecha final seleccionada
  };
  const disabledEndDate = (current) => {
    return selectedDate && current && current < selectedDate.startOf("day");
  };
  const handleDateChange1 = (date) => {
    setSelectedDate1(date);
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

  const handlePdfDownload = () => {
    const columns = [
      { header: "Ticket", dataKey: "ticket" },
      { header: "Fecha de Venta", dataKey: "datesale" },
      { header: "Cantidad", dataKey: "qty" },
      { header: "Precio Unitario", dataKey: "price" },
      { header: "Total de la Venta", dataKey: "total" },
      { header: "Vendedor Responsable", dataKey: "createdby" }
    ];

    // Obtiene la fecha actual para incluir en el nombre del archivo
    const today = new Date();
    const formattedDate = today.toISOString().slice(0, 10); // yyyy-mm-dd

    // Crea un nuevo documento PDF
    const doc = new jsPDF();

    // Usa autotable para agregar la tabla al documento
    doc.autoTable({
      columns,
      body: dataSource, // Usa tus datos del mockup
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
      { title: "Ticket", dataIndex: "ticket" },
      { title: "Fecha de Venta", dataIndex: "datesale" },
      { title: "Cantidad", dataIndex: "qty" },
      { title: "Precio Unitario", dataIndex: "price" },
      { title: "Total de la Venta", dataIndex: "total" },
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

  const dispatch = useDispatch();
  const data = useSelector((state) => state.toggle_header);
  const columns = [
    {
      title: "# Ticket",
      dataIndex: "ticket",
      sorter: (a, b) => a.product.length - b.product.length
    },
    {
      title: "Fecha de Venta",
      dataIndex: "datesale",
      sorter: (a, b) => new Date(a.createdon) - new Date(b.createdon)
    },
    {
      title: "Cantidad Vendida",
      dataIndex: "qty",
      sorter: (a, b) => a.qty - b.qty
    },
    {
      title: "Precio Unitario",
      dataIndex: "price",
      sorter: (a, b) =>
        parseFloat(a.price.replace("$", "")) -
        parseFloat(b.price.replace("$", ""))
    },
    {
      title: "Total de la Venta",
      render: (record) => {
        const total = parseFloat(record.price.replace("$", "")) * record.qty;
        return `$${total.toFixed(2)}`;
      }
    },
    {
      title: "Vendedor Responsable",
      dataIndex: "createdby",
      sorter: (a, b) => a.createdby.length - b.createdby.length
    },
    {
      title: "Actions",
      dataIndex: "actions",
      key: "actions",
      render: (_,record) => (
        <div className="action-table-data">
          <div className="edit-delete-action">
            {/* Asegúrate de usar data-bs-target con el id correcto */}
            <Link
              className="me-2 edit-icon p-2"
              to="#"
              data-bs-toggle="modal"
              data-bs-target="#invoice_details" // Cambiar a coincide con el id del modal
              onClick={() => setSelectedTicketId(record.ticket)} // Aquí estableces el ID
            >
              <i data-feather="eye" className="feather-eye"></i>
            </Link>
          </div>
        </div>
      )
    }
  ];

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
              <h4>Ventas </h4>
              <h6>Gestiona tus Ventas</h6>
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
                    dispatch(setToogleHeader(!data));
                  }}
                  className={data ? "active" : ""}
                >
                  <ChevronUp />
                </Link>
              </OverlayTrigger>
            </li>
          </ul>
        </div>

        <div className="card table-list-card">
          <div className="card-body">
            {/* Búsqueda y Filtros */}
            <div className="table-top">
              <div className="search-set">
                <div className="search-input">
                  <input
                    type="text"
                    placeholder="Buscar"
                    className="form-control form-control-sm formsearch"
                    value={searchValue}
                    onChange={handleSearchChange}
                  />
                  <Link className="btn btn-searchset">
                    <i data-feather="search" className="feather-search" />
                  </Link>
                </div>
              </div>
              <div className="row align-items-center">
                <div className="col-lg-4 col-sm-6 col-12">
                  <div className="input-blocks">
                    <div className="input-groupicon">
                      <Calendar className="info-img" />
                      <DatePicker
                        value={selectedDate}
                        onChange={handleDateChange}
                        className="filterdatepicker"
                        format="DD-MM-YYYY"
                        placeholder="Fecha Inicial"
                      />
                    </div>
                  </div>
                </div>
                <div className="col-lg-4 col-sm-6 col-12">
                  <div className="input-blocks">
                    <div className="input-groupicon">
                      <Calendar className="info-img" />
                      <DatePicker
                        value={selectedDate1}
                        onChange={handleDateChange1}
                        className="filterdatepicker"
                        format="DD-MM-YYYY"
                        placeholder="Fecha Final"
                        disabledDate={disabledEndDate} // Aquí se bloquean las fechas anteriores
                      />
                    </div>
                  </div>
                </div>
                <div className="col-lg-2 col-sm-12 col-12">
                  <div className="input-blocks">
                    <Link className="btn btn-filters ms-auto d-flex align-items-center justify-content-center">
                      <i data-feather="search" className="feather-search" />{" "}
                      Search
                    </Link>
                  </div>
                </div>
              </div>
            </div>
            <div className="table-responsive">
              <Table columns={columns} dataSource={filteredData} />
            </div>
          </div>
        </div>
        {/* /Product list */}
      </div>
      <ViewSale ticketId={selectedTicketId}  />
    </div>
  );
};

export default SalesReport;
