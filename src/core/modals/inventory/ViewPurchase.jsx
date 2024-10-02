import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { fetchPurchase } from "../../../Data/Inventario/PurchaseforID"; // I
import ImageWithBasePath from "../../img/imagewithbasebath";
import { Link } from "react-router-dom";
import styled from "styled-components";

const ViewPurchase = ({ ticketId }) => {
  const [saleData, setSaleData] = useState(null);
  console.log("entro al modal")
  useEffect(() => {
    if (ticketId) {
      console.log(ticketId);
      const fetchSaleData = async () => {
        const data = await fetchPurchase(ticketId);
        console.log("Entrando al modal",data); // Añade esto para verificar la estructura de 'data'
        setSaleData(data);
      };
      fetchSaleData();
    }
  }, [ticketId]);
  // Aquí puedes usar `saleData` para mostrar los detalles de la venta en el modal
  const ModalContent = styled.div`
    border-radius: 10px;
    border: none;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  `;
  const handlePrint = () => {
    const modalContent = document.getElementById("receipt_details");

    // Abre una nueva ventana para imprimir
    const printWindow = window.open("", "", "width=300,height=600"); // 300px es aproximadamente 80mm

    // Escribe la estructura HTML y el contenido del modal en la nueva ventana
    printWindow.document.write(`
      <html>
        <head>
          <title>Print</title>
          <style>
            @media print {
              body {
                width: 80mm;
                margin: 0;
                font-family: Arial, sans-serif;
                font-size: 12px; /* Tamaño de fuente adecuadamente pequeño */
                color: #333;
                text-align: center; /* Centrar el contenido */
              }
              /* Asegúrate de que las tablas o elementos anchos no sobrepasen los 80mm */
              table {
                width: 100%;
                border-collapse: collapse;
              }
              th, td {
                border: 1px solid #ddd; /* Define bordes claros si se necesitan */
                padding: 4px;
              }
              .icon-head, .info, .invoice-bar {
                padding: 5px 0; /* Espaciado entre secciones */
              }
            }
          </style>
        </head>
        <body>
          <div>${modalContent.innerHTML}</div>
        </body>
      </html>
    `);

    // Completa la carga y prepara la ventana para imprimir
    printWindow.document.close();

    // Espera un momento antes de imprimir
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  const ModalBody = styled.div`
    padding: 20px;
    font-family: Arial, sans-serif;
    color: #333;

    .icon-head {
      margin-bottom: 20px;
    }
    .info {
      margin: 10px 0;
      h6 {
        font-size: 18px;
        font-weight: bold;
        margin-bottom: 5px;
      }
      p {
        margin: 0;
        font-size: 14px;
      }
      a {
        color: #007bff;
        text-decoration: none;
      }
    }
  `;

  const TaxInvoice = styled.div`
    margin: 20px 0;
    h6 {
      text-align: center;
      font-weight: bold;
      margin: 20px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      &:before,
      &:after {
        content: "";
        flex: 1;
        border-bottom: 1px dashed #ccc;
      }
      &:before {
        margin-right: 10px;
      }
      &:after {
        margin-left: 10px;
      }
    }
  `;

  const Table = styled.table`
    width: 100%;
    margin: 20px 0;

    thead th {
      font-weight: bold;
      border-bottom: 2px solid #333;
      padding: 10px;
    }

    tbody tr {
      border-bottom: 1px dashed #ccc;
      td {
        padding: 10px;
        vertical-align: middle;
      }
    }

    .text-end {
      text-align: right;
    }
  `;

  const InvoiceBar = styled.div`
    margin-top: 30px;
    text-align: center;

    p {
      margin: 10px 0;
      font-size: 14px;
    }

    a.btn-primary {
      margin-top: 15px;
      padding: 10px 20px;
      border-radius: 5px;
      background-color: #007bff;
      color: #fff;
      text-decoration: none;
      &:hover {
        background-color: #0056b3;
      }
    }
  `;

  return (
    <div
      className="modal1 fade modal-default"
      id="receipt_details"
      aria-labelledby="receipt_details"
    >
      <div className="modal-dialog modal-dialog-centered">
        <ModalContent className="modal-content">
          <div className="d-flex justify-content-end">
            <button
              type="button"
              className="close p-0"
              data-bs-dismiss="modal"
              aria-label="Close"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <ModalBody className="modal-body">
            <div className="icon-head text-center">
              <Link to="#">
                <ImageWithBasePath
                  src="assets/img/logo1.png"
                  width={100}
                  height={30}
                  alt="Receipt Logo"
                />
              </Link>
            </div>
            <div className="text-center info text-center">
              <h6>{saleData?.companyName}</h6>
              <p className="mb-0">
                Correo:{" "}
                <Link to={`mailto:${saleData?.companyEmail}`}>
                  {saleData?.companyEmail}
                </Link>
              </p>
            </div>
            <TaxInvoice className="tax-invoice">
              <h6>Ticket de venta #{saleData?.ticket}</h6>
              <div className="row">
                <div className="col-sm-12 col-md-6">
                  <div className="invoice-user-name">
                    <span>Nombre Cliente: </span>
                    <span>{saleData?.customerName}</span>
                  </div>
                  <div className="invoice-user-name">
                    <span># ticket: </span>
                    <span>{saleData?.ticket}</span>
                  </div>
                </div>
                <div className="col-sm-12 col-md-6">
                  <div className="invoice-user-name">
                    <span># Cliente: </span>
                    <span>{saleData?.customerId}</span>
                  </div>
                  <div className="invoice-user-name">
                    <span>Fecha: </span>
                    <span>{saleData?.date}</span>
                  </div>
                </div>
              </div>
            </TaxInvoice>
            <Table className="table-borderless w-100 table-fit">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Precio</th>
                  <th>Cantidad</th>
                  <th className="text-end">Total</th>
                </tr>
              </thead>
              <tbody>
                {saleData?.items?.map((item, index) => (
                  <tr key={index}>
                    <td>
                      {index + 1}. {item.name}
                    </td>
                    <td>${item.price}</td>
                    <td>{item.qty}</td>
                    <td className="text-end">${item.price * item.qty}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4}>
                    <Table className="table-borderless w-100 table-fit">
                      <tbody>
                        <tr>
                          <td>Sub Total :</td>
                          <td className="text-end">
                            ${saleData?.subTotal.toFixed(2)}
                          </td>
                        </tr>
                        <tr>
                          <td>IVA :</td>
                          <td className="text-end">
                            ${saleData?.tax.toFixed(2)}
                          </td>
                        </tr>
                        <tr>
                          <td>Total :</td>
                          <td className="text-end">
                            ${saleData?.totalBill.toFixed(2)}
                          </td>
                        </tr>
                        <tr>
                          <td>Cambio :</td>
                          <td className="text-end">
                            ${saleData?.due.toFixed(2)}
                          </td>
                        </tr>
                        <tr>
                          <td>Total Payable :</td>
                          <td className="text-end">
                            ${saleData?.totalPayable.toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </Table>
                  </td>
                </tr>
              </tbody>
            </Table>
            <InvoiceBar className="text-center invoice-bar">
              <p>**IVA acreditable según la legislación vigente.</p>

              <p>¡Gracias por su preferencia!</p>
              <button onClick={handlePrint} className="btn btn-primary">
                Huevos
              </button>
            </InvoiceBar>
          </ModalBody>
        </ModalContent>
      </div>
    </div>
  );
};

ViewPurchase.propTypes = {
  ticketId: PropTypes.any // Cambiado a any para simplificar
};

export default ViewPurchase;
