import React from "react";
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import { ContractAudit } from "@auditsimple/types";

// Create styles
const styles = StyleSheet.create({
    page: {
        flexDirection: "column",
        backgroundColor: "#ffffff",
        padding: 40,
        fontFamily: "Helvetica",
    },
    header: {
        marginBottom: 30,
        borderBottomWidth: 1,
        borderBottomColor: "#e2e8f0",
        paddingBottom: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: "bold",
        color: "#0f172a",
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        color: "#64748b",
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: "bold",
        color: "#334155",
        marginBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#f1f5f9",
        paddingBottom: 4,
    },
    loyaltyCard: {
        backgroundColor: "#f8fafc",
        padding: 20,
        borderRadius: 8,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: "#e2e8f0",
    },
    loyaltyTitle: {
        fontSize: 12,
        color: "#64748b",
        textTransform: "uppercase",
        marginBottom: 8,
    },
    loyaltyAmount: {
        fontSize: 32,
        fontWeight: "bold",
        color: "#0f172a",
    },
    clauseItem: {
        marginBottom: 16,
        padding: 12,
        backgroundColor: "#f8fafc",
        borderRadius: 6,
        borderLeftWidth: 4,
        borderLeftColor: "#94a3b8",
    },
    clauseHighSeverity: {
        borderLeftColor: "#ef4444",
        backgroundColor: "#fef2f2",
    },
    clauseMediumSeverity: {
        borderLeftColor: "#f59e0b",
        backgroundColor: "#fffbeb",
    },
    clauseLowSeverity: {
        borderLeftColor: "#eab308",
    },
    clauseTitle: {
        fontSize: 14,
        fontWeight: "bold",
        color: "#1e293b",
        marginBottom: 4,
    },
    clauseSummary: {
        fontSize: 12,
        color: "#475569",
        marginBottom: 8,
    },
    clauseCost: {
        fontSize: 12,
        fontWeight: "bold",
        color: "#0f172a",
        marginTop: 4,
    },
    footer: {
        position: "absolute",
        bottom: 30,
        left: 40,
        right: 40,
        fontSize: 10,
        color: "#94a3b8",
        textAlign: "center",
        borderTopWidth: 1,
        borderTopColor: "#e2e8f0",
        paddingTop: 10,
    },
});

export function formatCAD(amount: number): string {
    return new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

interface AuditReportPDFProps {
    audit: ContractAudit;
}

export function AuditReportPDF({ audit }: AuditReportPDFProps) {
    const highSeverityCount = audit.issues.filter(i => i.severity === "HIGH" || i.severity === "CRITICAL").length;
    const mediumSeverityCount = audit.issues.filter(i => i.severity === "MEDIUM").length;

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <View style={styles.header}>
                    <Text style={styles.title}>SimplyAudit Final Report</Text>
                    <Text style={styles.subtitle}>Audit ID: {audit.auditId}</Text>
                    <Text style={styles.subtitle}>Date: {new Date(audit.createdAt).toLocaleDateString()}</Text>
                </View>

                {audit.costOfLoyalty && (
                    <View style={styles.loyaltyCard}>
                        <Text style={styles.loyaltyTitle}>Estimated Cost of Loyalty</Text>
                        <Text style={styles.loyaltyAmount}>{formatCAD(audit.costOfLoyalty.totalCost)}</Text>
                        <Text style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
                            Range: {formatCAD(audit.costOfLoyalty.confidenceRange.low)} - {formatCAD(audit.costOfLoyalty.confidenceRange.high)}
                        </Text>
                    </View>
                )}

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Executive Summary</Text>
                    <Text style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
                        {audit.executiveSummary || `This contract contains ${audit.clauses.length} key clauses, with ${highSeverityCount} high-risk and ${mediumSeverityCount} medium-risk issues identified.`}
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Key Issues & Hidden Costs</Text>
                    {audit.issues.map((issue, index) => (
                        <View
                            key={index}
                            style={[
                                styles.clauseItem,
                                (issue.severity === "HIGH" || issue.severity === "CRITICAL") ? styles.clauseHighSeverity :
                                    issue.severity === "MEDIUM" ? styles.clauseMediumSeverity :
                                        styles.clauseLowSeverity
                            ]}
                        >
                            <Text style={styles.clauseTitle}>{issue.title} ({issue.severity})</Text>
                            <Text style={styles.clauseSummary}>{issue.description}</Text>

                            {issue.benchmarkComparison && issue.benchmarkComparison.direction === "UNFAVORABLE" && (
                                <Text style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>
                                    Worse than market benchmark.
                                </Text>
                            )}

                            {issue.estimatedLifetimeCost && issue.estimatedLifetimeCost > 0 ? (
                                <Text style={styles.clauseCost}>
                                    Estimated Cost: {formatCAD(issue.estimatedLifetimeCost)}
                                </Text>
                            ) : null}
                        </View>
                    ))}
                </View>

                <View style={styles.footer}>
                    <Text>Generated by SimplyAudit • Confidential • Not financial advice</Text>
                </View>
            </Page>
        </Document>
    );
}
