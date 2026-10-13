
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "agent_payouts": {
                  Row: {
                    "agent_id": string,"amount_minor": number,"approved_at": string | null,"approved_by": string | null,"created_at": string,"currency": Database["public"]['Enums']["currency_code"],"deal_id": string,"id": string,"notes": string | null,"paid_by": string | null,"paid_on": string | null,"payment_method": Database["public"]['Enums']["payment_method"] | null,"payment_reference": string | null,"reason": string | null,"requested_by": string,"status": Database["public"]['Enums']["payout_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id": string,"amount_minor": number,"approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"currency": Database["public"]['Enums']["currency_code"],"deal_id": string,"id"?: string,"notes"?: string | null,"paid_by"?: string | null,"paid_on"?: string | null,"payment_method"?: Database["public"]['Enums']["payment_method"] | null,"payment_reference"?: string | null,"reason"?: string | null,"requested_by": string,"status"?: Database["public"]['Enums']["payout_status"],"updated_at"?: string
                  }
                  Update: {
                    "agent_id"?: string,"amount_minor"?: number,"approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency_code"],"deal_id"?: string,"id"?: string,"notes"?: string | null,"paid_by"?: string | null,"paid_on"?: string | null,"payment_method"?: Database["public"]['Enums']["payment_method"] | null,"payment_reference"?: string | null,"reason"?: string | null,"requested_by"?: string,"status"?: Database["public"]['Enums']["payout_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_payouts_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_payouts_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_payouts_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_payouts_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_payouts_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deal_financials"
      referencedColumns: ["deal_id"]
    },{
      foreignKeyName: "agent_payouts_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deal_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_payouts_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "rental_deals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_payouts_paid_by_fkey"
      columns: ["paid_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_payouts_paid_by_fkey"
      columns: ["paid_by"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_payouts_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_payouts_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    }
                  ]
                },"automation_events": {
                  Row: {
                    "attempts": number,"created_at": string,"error_summary": string | null,"id": string,"idempotency_key": string,"outcome": string | null,"rule_code": string,"run_id": string | null,"status": string,"subject_id": string,"subject_type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"error_summary"?: string | null,"id"?: string,"idempotency_key": string,"outcome"?: string | null,"rule_code": string,"run_id"?: string | null,"status": string,"subject_id": string,"subject_type": string,"updated_at"?: string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"error_summary"?: string | null,"id"?: string,"idempotency_key"?: string,"outcome"?: string | null,"rule_code"?: string,"run_id"?: string | null,"status"?: string,"subject_id"?: string,"subject_type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "automation_events_rule_code_fkey"
      columns: ["rule_code"]
isOneToOne: false
      referencedRelation: "automation_rules"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "automation_events_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "automation_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"automation_rules": {
                  Row: {
                    "code": string,"config": NonNullable<Json>,"enabled": boolean,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"config"?: NonNullable<Json>,"enabled"?: boolean,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "code"?: string,"config"?: NonNullable<Json>,"enabled"?: boolean,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "automation_rules_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "automation_rules_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    }
                  ]
                },"automation_runs": {
                  Row: {
                    "finished_at": string | null,"id": string,"started_at": string,"started_by": string | null,"status": string,"summary": NonNullable<Json>,"trigger": string
                  }
                  ComputedFields: never
                  Insert: {
                    "finished_at"?: string | null,"id"?: string,"started_at"?: string,"started_by"?: string | null,"status"?: string,"summary"?: NonNullable<Json>,"trigger": string
                  }
                  Update: {
                    "finished_at"?: string | null,"id"?: string,"started_at"?: string,"started_by"?: string | null,"status"?: string,"summary"?: NonNullable<Json>,"trigger"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "automation_runs_started_by_fkey"
      columns: ["started_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "automation_runs_started_by_fkey"
      columns: ["started_by"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    }
                  ]
                },"commission_transactions": {
                  Row: {
                    "amount_minor": number,"commission_id": string,"created_at": string,"currency": Database["public"]['Enums']["currency_code"],"entry_type": Database["public"]['Enums']["ledger_entry_type"],"id": string,"notes": string | null,"occurred_on": string,"payment_method": Database["public"]['Enums']["payment_method"] | null,"reason": string | null,"recorded_by": string,"reference": string | null,"reverses_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"commission_id": string,"created_at"?: string,"currency": Database["public"]['Enums']["currency_code"],"entry_type": Database["public"]['Enums']["ledger_entry_type"],"id"?: string,"notes"?: string | null,"occurred_on": string,"payment_method"?: Database["public"]['Enums']["payment_method"] | null,"reason"?: string | null,"recorded_by": string,"reference"?: string | null,"reverses_id"?: string | null
                  }
                  Update: {
                    "amount_minor"?: number,"commission_id"?: string,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency_code"],"entry_type"?: Database["public"]['Enums']["ledger_entry_type"],"id"?: string,"notes"?: string | null,"occurred_on"?: string,"payment_method"?: Database["public"]['Enums']["payment_method"] | null,"reason"?: string | null,"recorded_by"?: string,"reference"?: string | null,"reverses_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "commission_transactions_commission_id_fkey"
      columns: ["commission_id"]
isOneToOne: false
      referencedRelation: "commission_balances"
      referencedColumns: ["commission_id"]
    },{
      foreignKeyName: "commission_transactions_commission_id_fkey"
      columns: ["commission_id"]
isOneToOne: false
      referencedRelation: "commissions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "commission_transactions_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "commission_transactions_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "commission_transactions_reverses_id_fkey"
      columns: ["reverses_id"]
isOneToOne: false
      referencedRelation: "commission_transactions"
      referencedColumns: ["id"]
    }
                  ]
                },"commissions": {
                  Row: {
                    "adjustment_minor": number,"agreed_amount_minor": number,"agreed_rate": number | null,"amount_paid_minor": number,"calculation_type": Database["public"]['Enums']["commission_calculation"],"created_at": string,"currency": Database["public"]['Enums']["currency_code"],"deal_id": string,"due_date": string | null,"fee_payer": Database["public"]['Enums']["fee_payer"],"id": string,"invoiced_on": string | null,"notes": string | null,"payment_status": Database["public"]['Enums']["commission_payment_status"],"updated_at": string,"written_off_minor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "adjustment_minor"?: number,"agreed_amount_minor": number,"agreed_rate"?: number | null,"amount_paid_minor"?: number,"calculation_type": Database["public"]['Enums']["commission_calculation"],"created_at"?: string,"currency"?: Database["public"]['Enums']["currency_code"],"deal_id": string,"due_date"?: string | null,"fee_payer": Database["public"]['Enums']["fee_payer"],"id"?: string,"invoiced_on"?: string | null,"notes"?: string | null,"payment_status"?: Database["public"]['Enums']["commission_payment_status"],"updated_at"?: string,"written_off_minor"?: number
                  }
                  Update: {
                    "adjustment_minor"?: number,"agreed_amount_minor"?: number,"agreed_rate"?: number | null,"amount_paid_minor"?: number,"calculation_type"?: Database["public"]['Enums']["commission_calculation"],"created_at"?: string,"currency"?: Database["public"]['Enums']["currency_code"],"deal_id"?: string,"due_date"?: string | null,"fee_payer"?: Database["public"]['Enums']["fee_payer"],"id"?: string,"invoiced_on"?: string | null,"notes"?: string | null,"payment_status"?: Database["public"]['Enums']["commission_payment_status"],"updated_at"?: string,"written_off_minor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "commissions_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deal_financials"
      referencedColumns: ["deal_id"]
    },{
      foreignKeyName: "commissions_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deal_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "commissions_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "rental_deals"
      referencedColumns: ["id"]
    }
                  ]
                },"deal_documents": {
                  Row: {
                    "created_at": string,"deal_id": string,"file_name": string,"id": string,"kind": Database["public"]['Enums']["document_kind"],"storage_path": string,"uploaded_by": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deal_id": string,"file_name": string,"id"?: string,"kind"?: Database["public"]['Enums']["document_kind"],"storage_path": string,"uploaded_by": string
                  }
                  Update: {
                    "created_at"?: string,"deal_id"?: string,"file_name"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["document_kind"],"storage_path"?: string,"uploaded_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deal_documents_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deal_financials"
      referencedColumns: ["deal_id"]
    },{
      foreignKeyName: "deal_documents_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deal_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deal_documents_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "rental_deals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deal_documents_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deal_documents_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    }
                  ]
                },"document_counters": {
                  Row: {
                    "doc_type": Database["public"]['Enums']["document_type"],"last_value": number,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "doc_type": Database["public"]['Enums']["document_type"],"last_value"?: number,"year": number
                  }
                  Update: {
                    "doc_type"?: Database["public"]['Enums']["document_type"],"last_value"?: number,"year"?: number
                  }
                  Relationships: [
                    
                  ]
                },"expenses": {
                  Row: {
                    "amount_minor": number,"approved_at": string | null,"approved_by": string | null,"category": Database["public"]['Enums']["expense_category"],"created_at": string,"created_by": string,"currency": Database["public"]['Enums']["currency_code"],"description": string,"expense_date": string,"id": string,"paid_on": string | null,"payment_method": Database["public"]['Enums']["payment_method"] | null,"receipt_path": string | null,"rejection_reason": string | null,"status": Database["public"]['Enums']["expense_status"],"updated_at": string,"vendor": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"approved_at"?: string | null,"approved_by"?: string | null,"category": Database["public"]['Enums']["expense_category"],"created_at"?: string,"created_by": string,"currency"?: Database["public"]['Enums']["currency_code"],"description": string,"expense_date": string,"id"?: string,"paid_on"?: string | null,"payment_method"?: Database["public"]['Enums']["payment_method"] | null,"receipt_path"?: string | null,"rejection_reason"?: string | null,"status"?: Database["public"]['Enums']["expense_status"],"updated_at"?: string,"vendor"?: string | null
                  }
                  Update: {
                    "amount_minor"?: number,"approved_at"?: string | null,"approved_by"?: string | null,"category"?: Database["public"]['Enums']["expense_category"],"created_at"?: string,"created_by"?: string,"currency"?: Database["public"]['Enums']["currency_code"],"description"?: string,"expense_date"?: string,"id"?: string,"paid_on"?: string | null,"payment_method"?: Database["public"]['Enums']["payment_method"] | null,"receipt_path"?: string | null,"rejection_reason"?: string | null,"status"?: Database["public"]['Enums']["expense_status"],"updated_at"?: string,"vendor"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    }
                  ]
                },"finance_settings": {
                  Row: {
                    "commission_earned_rule": Database["public"]['Enums']["commission_earned_rule"],"default_agent_share_fixed_minor": number | null,"default_agent_share_method": Database["public"]['Enums']["agent_share_method"],"default_agent_share_rate": number | null,"default_commission_fixed_minor": number | null,"default_commission_method": Database["public"]['Enums']["commission_method"] | null,"default_commission_rate": number | null,"payout_eligibility_rule": Database["public"]['Enums']["payout_eligibility_rule"],"singleton": boolean,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "commission_earned_rule"?: Database["public"]['Enums']["commission_earned_rule"],"default_agent_share_fixed_minor"?: number | null,"default_agent_share_method"?: Database["public"]['Enums']["agent_share_method"],"default_agent_share_rate"?: number | null,"default_commission_fixed_minor"?: number | null,"default_commission_method"?: Database["public"]['Enums']["commission_method"] | null,"default_commission_rate"?: number | null,"payout_eligibility_rule"?: Database["public"]['Enums']["payout_eligibility_rule"],"singleton"?: boolean,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "commission_earned_rule"?: Database["public"]['Enums']["commission_earned_rule"],"default_agent_share_fixed_minor"?: number | null,"default_agent_share_method"?: Database["public"]['Enums']["agent_share_method"],"default_agent_share_rate"?: number | null,"default_commission_fixed_minor"?: number | null,"default_commission_method"?: Database["public"]['Enums']["commission_method"] | null,"default_commission_rate"?: number | null,"payout_eligibility_rule"?: Database["public"]['Enums']["payout_eligibility_rule"],"singleton"?: boolean,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "finance_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "finance_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    }
                  ]
                },"financial_audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"actor_role": Database["public"]['Enums']["staff_role"] | null,"deal_id": string | null,"entity_id": string | null,"entity_type": string,"id": string,"new_data": Json | null,"occurred_at": string,"old_data": Json | null,"reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"actor_role"?: Database["public"]['Enums']["staff_role"] | null,"deal_id"?: string | null,"entity_id"?: string | null,"entity_type": string,"id"?: string,"new_data"?: Json | null,"occurred_at"?: string,"old_data"?: Json | null,"reason"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"actor_role"?: Database["public"]['Enums']["staff_role"] | null,"deal_id"?: string | null,"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"new_data"?: Json | null,"occurred_at"?: string,"old_data"?: Json | null,"reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "financial_audit_log_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "financial_audit_log_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    }
                  ]
                },"form_attempts": {
                  Row: {
                    "client_hash": string,"created_at": string,"id": number,"kind": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_hash": string,"created_at"?: string,"id"?: never,"kind": string
                  }
                  Update: {
                    "client_hash"?: string,"created_at"?: string,"id"?: never,"kind"?: string
                  }
                  Relationships: [
                    
                  ]
                },"generated_documents": {
                  Row: {
                    "created_at": string,"doc_type": Database["public"]['Enums']["document_type"],"entity_id": string,"file_name": string | null,"generated_by": string,"id": string,"locale": Database["public"]['Enums']["locale_code"],"reference": string,"storage_path": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"doc_type": Database["public"]['Enums']["document_type"],"entity_id": string,"file_name"?: string | null,"generated_by": string,"id"?: string,"locale": Database["public"]['Enums']["locale_code"],"reference": string,"storage_path"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"doc_type"?: Database["public"]['Enums']["document_type"],"entity_id"?: string,"file_name"?: string | null,"generated_by"?: string,"id"?: string,"locale"?: Database["public"]['Enums']["locale_code"],"reference"?: string,"storage_path"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "generated_documents_generated_by_fkey"
      columns: ["generated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "generated_documents_generated_by_fkey"
      columns: ["generated_by"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    }
                  ]
                },"landlord_submissions": {
                  Row: {
                    "address": string | null,"bedrooms": number | null,"created_at": string,"currency": Database["public"]['Enums']["currency_code"],"description": string | null,"district": string | null,"email": string | null,"expected_rent_minor": number | null,"handled_by": string | null,"id": string,"internal_notes": string | null,"neighborhood": string | null,"phone": string | null,"preferred_language": Database["public"]['Enums']["locale_code"],"property_category": Database["public"]['Enums']["property_category"],"property_type": Database["public"]['Enums']["property_type"] | null,"relationship": Database["public"]['Enums']["submitter_relationship"],"status": Database["public"]['Enums']["submission_status"],"submitter_name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"bedrooms"?: number | null,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency_code"],"description"?: string | null,"district"?: string | null,"email"?: string | null,"expected_rent_minor"?: number | null,"handled_by"?: string | null,"id"?: string,"internal_notes"?: string | null,"neighborhood"?: string | null,"phone"?: string | null,"preferred_language"?: Database["public"]['Enums']["locale_code"],"property_category": Database["public"]['Enums']["property_category"],"property_type"?: Database["public"]['Enums']["property_type"] | null,"relationship": Database["public"]['Enums']["submitter_relationship"],"status"?: Database["public"]['Enums']["submission_status"],"submitter_name": string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"bedrooms"?: number | null,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency_code"],"description"?: string | null,"district"?: string | null,"email"?: string | null,"expected_rent_minor"?: number | null,"handled_by"?: string | null,"id"?: string,"internal_notes"?: string | null,"neighborhood"?: string | null,"phone"?: string | null,"preferred_language"?: Database["public"]['Enums']["locale_code"],"property_category"?: Database["public"]['Enums']["property_category"],"property_type"?: Database["public"]['Enums']["property_type"] | null,"relationship"?: Database["public"]['Enums']["submitter_relationship"],"status"?: Database["public"]['Enums']["submission_status"],"submitter_name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "landlord_submissions_handled_by_fkey"
      columns: ["handled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "landlord_submissions_handled_by_fkey"
      columns: ["handled_by"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    }
                  ]
                },"landlords": {
                  Row: {
                    "archived_at": string | null,"business_name": string | null,"created_at": string,"created_by": string | null,"email": string | null,"full_name": string,"id": string,"internal_notes": string | null,"phone": string | null,"preferred_language": Database["public"]['Enums']["locale_code"],"updated_at": string,"verification_status": Database["public"]['Enums']["verification_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"business_name"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"full_name": string,"id"?: string,"internal_notes"?: string | null,"phone"?: string | null,"preferred_language"?: Database["public"]['Enums']["locale_code"],"updated_at"?: string,"verification_status"?: Database["public"]['Enums']["verification_status"]
                  }
                  Update: {
                    "archived_at"?: string | null,"business_name"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"full_name"?: string,"id"?: string,"internal_notes"?: string | null,"phone"?: string | null,"preferred_language"?: Database["public"]['Enums']["locale_code"],"updated_at"?: string,"verification_status"?: Database["public"]['Enums']["verification_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "landlords_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "landlords_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    }
                  ]
                },"lead_activities": {
                  Row: {
                    "activity_type": Database["public"]['Enums']["activity_type"],"created_at": string,"from_agent_id": string | null,"from_stage": Database["public"]['Enums']["lead_stage"] | null,"id": string,"lead_id": string,"notes": string | null,"performed_by": string,"to_agent_id": string | null,"to_stage": Database["public"]['Enums']["lead_stage"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_type": Database["public"]['Enums']["activity_type"],"created_at"?: string,"from_agent_id"?: string | null,"from_stage"?: Database["public"]['Enums']["lead_stage"] | null,"id"?: string,"lead_id": string,"notes"?: string | null,"performed_by": string,"to_agent_id"?: string | null,"to_stage"?: Database["public"]['Enums']["lead_stage"] | null
                  }
                  Update: {
                    "activity_type"?: Database["public"]['Enums']["activity_type"],"created_at"?: string,"from_agent_id"?: string | null,"from_stage"?: Database["public"]['Enums']["lead_stage"] | null,"id"?: string,"lead_id"?: string,"notes"?: string | null,"performed_by"?: string,"to_agent_id"?: string | null,"to_stage"?: Database["public"]['Enums']["lead_stage"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lead_activities_from_agent_id_fkey"
      columns: ["from_agent_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_activities_from_agent_id_fkey"
      columns: ["from_agent_id"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_activities_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "crm_lead_list"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_activities_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_activities_performed_by_fkey"
      columns: ["performed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_activities_performed_by_fkey"
      columns: ["performed_by"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_activities_to_agent_id_fkey"
      columns: ["to_agent_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_activities_to_agent_id_fkey"
      columns: ["to_agent_id"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    }
                  ]
                },"leads": {
                  Row: {
                    "assigned_agent_id": string | null,"bedrooms_wanted": number | null,"budget_max_minor": number | null,"budget_min_minor": number | null,"campaign": string | null,"created_at": string,"currency": Database["public"]['Enums']["currency_code"],"customer_name": string,"desired_move_in": string | null,"email": string | null,"enquiry_message": string | null,"id": string,"lost_reason": string | null,"next_follow_up_at": string | null,"phone": string | null,"preferred_area": string | null,"preferred_language": Database["public"]['Enums']["locale_code"],"property_category": Database["public"]['Enums']["property_category"] | null,"property_id": string | null,"rental_period_months": number | null,"requirements_notes": string | null,"sla_breached_at": string | null,"source": Database["public"]['Enums']["lead_source"],"stage": Database["public"]['Enums']["lead_stage"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_agent_id"?: string | null,"bedrooms_wanted"?: number | null,"budget_max_minor"?: number | null,"budget_min_minor"?: number | null,"campaign"?: string | null,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency_code"],"customer_name": string,"desired_move_in"?: string | null,"email"?: string | null,"enquiry_message"?: string | null,"id"?: string,"lost_reason"?: string | null,"next_follow_up_at"?: string | null,"phone"?: string | null,"preferred_area"?: string | null,"preferred_language"?: Database["public"]['Enums']["locale_code"],"property_category"?: Database["public"]['Enums']["property_category"] | null,"property_id"?: string | null,"rental_period_months"?: number | null,"requirements_notes"?: string | null,"sla_breached_at"?: string | null,"source"?: Database["public"]['Enums']["lead_source"],"stage"?: Database["public"]['Enums']["lead_stage"],"updated_at"?: string
                  }
                  Update: {
                    "assigned_agent_id"?: string | null,"bedrooms_wanted"?: number | null,"budget_max_minor"?: number | null,"budget_min_minor"?: number | null,"campaign"?: string | null,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency_code"],"customer_name"?: string,"desired_move_in"?: string | null,"email"?: string | null,"enquiry_message"?: string | null,"id"?: string,"lost_reason"?: string | null,"next_follow_up_at"?: string | null,"phone"?: string | null,"preferred_area"?: string | null,"preferred_language"?: Database["public"]['Enums']["locale_code"],"property_category"?: Database["public"]['Enums']["property_category"] | null,"property_id"?: string | null,"rental_period_months"?: number | null,"requirements_notes"?: string | null,"sla_breached_at"?: string | null,"source"?: Database["public"]['Enums']["lead_source"],"stage"?: Database["public"]['Enums']["lead_stage"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "leads_assigned_agent_id_fkey"
      columns: ["assigned_agent_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_assigned_agent_id_fkey"
      columns: ["assigned_agent_id"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "public_properties"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_preferences": {
                  Row: {
                    "enabled": boolean,"type": Database["public"]['Enums']["notification_type"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "enabled"?: boolean,"type": Database["public"]['Enums']["notification_type"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "enabled"?: boolean,"type"?: Database["public"]['Enums']["notification_type"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "created_at": string,"dedupe_key": string,"entity_id": string,"entity_type": string,"id": string,"read_at": string | null,"recipient_id": string,"type": Database["public"]['Enums']["notification_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"dedupe_key": string,"entity_id": string,"entity_type": string,"id"?: string,"read_at"?: string | null,"recipient_id": string,"type": Database["public"]['Enums']["notification_type"]
                  }
                  Update: {
                    "created_at"?: string,"dedupe_key"?: string,"entity_id"?: string,"entity_type"?: string,"id"?: string,"read_at"?: string | null,"recipient_id"?: string,"type"?: Database["public"]['Enums']["notification_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"full_name": string,"id": string,"is_active": boolean,"phone": string | null,"preferred_language": Database["public"]['Enums']["locale_code"],"role": Database["public"]['Enums']["staff_role"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"full_name": string,"id": string,"is_active"?: boolean,"phone"?: string | null,"preferred_language"?: Database["public"]['Enums']["locale_code"],"role": Database["public"]['Enums']["staff_role"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"full_name"?: string,"id"?: string,"is_active"?: boolean,"phone"?: string | null,"preferred_language"?: Database["public"]['Enums']["locale_code"],"role"?: Database["public"]['Enums']["staff_role"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"properties": {
                  Row: {
                    "address": string | null,"archived_at": string | null,"area_unit": Database["public"]['Enums']["area_unit"],"assigned_agent_id": string | null,"availability_status": Database["public"]['Enums']["availability_status"],"available_from": string | null,"bathrooms": number | null,"bedrooms": number | null,"category": Database["public"]['Enums']["property_category"],"city": string,"created_at": string,"created_by": string,"currency": Database["public"]['Enums']["currency_code"],"deposit_amount_minor": number | null,"district": string | null,"floor_area": number | null,"furnishing_status": Database["public"]['Enums']["furnishing_status"] | null,"id": string,"latitude": number | null,"lease_terms": string | null,"listing_code": string,"longitude": number | null,"monthly_rent_minor": number,"neighborhood": string | null,"property_type": Database["public"]['Enums']["property_type"],"publication_status": Database["public"]['Enums']["publication_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"archived_at"?: string | null,"area_unit"?: Database["public"]['Enums']["area_unit"],"assigned_agent_id"?: string | null,"availability_status"?: Database["public"]['Enums']["availability_status"],"available_from"?: string | null,"bathrooms"?: number | null,"bedrooms"?: number | null,"category": Database["public"]['Enums']["property_category"],"city"?: string,"created_at"?: string,"created_by": string,"currency"?: Database["public"]['Enums']["currency_code"],"deposit_amount_minor"?: number | null,"district"?: string | null,"floor_area"?: number | null,"furnishing_status"?: Database["public"]['Enums']["furnishing_status"] | null,"id"?: string,"latitude"?: number | null,"lease_terms"?: string | null,"listing_code": string,"longitude"?: number | null,"monthly_rent_minor": number,"neighborhood"?: string | null,"property_type": Database["public"]['Enums']["property_type"],"publication_status"?: Database["public"]['Enums']["publication_status"],"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"archived_at"?: string | null,"area_unit"?: Database["public"]['Enums']["area_unit"],"assigned_agent_id"?: string | null,"availability_status"?: Database["public"]['Enums']["availability_status"],"available_from"?: string | null,"bathrooms"?: number | null,"bedrooms"?: number | null,"category"?: Database["public"]['Enums']["property_category"],"city"?: string,"created_at"?: string,"created_by"?: string,"currency"?: Database["public"]['Enums']["currency_code"],"deposit_amount_minor"?: number | null,"district"?: string | null,"floor_area"?: number | null,"furnishing_status"?: Database["public"]['Enums']["furnishing_status"] | null,"id"?: string,"latitude"?: number | null,"lease_terms"?: string | null,"listing_code"?: string,"longitude"?: number | null,"monthly_rent_minor"?: number,"neighborhood"?: string | null,"property_type"?: Database["public"]['Enums']["property_type"],"publication_status"?: Database["public"]['Enums']["publication_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "properties_assigned_agent_id_fkey"
      columns: ["assigned_agent_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "properties_assigned_agent_id_fkey"
      columns: ["assigned_agent_id"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "properties_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "properties_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    }
                  ]
                },"property_media": {
                  Row: {
                    "caption": string | null,"created_at": string,"display_order": number,"id": string,"is_cover": boolean,"media_type": Database["public"]['Enums']["media_type"],"property_id": string,"storage_path": string
                  }
                  ComputedFields: never
                  Insert: {
                    "caption"?: string | null,"created_at"?: string,"display_order"?: number,"id"?: string,"is_cover"?: boolean,"media_type"?: Database["public"]['Enums']["media_type"],"property_id": string,"storage_path": string
                  }
                  Update: {
                    "caption"?: string | null,"created_at"?: string,"display_order"?: number,"id"?: string,"is_cover"?: boolean,"media_type"?: Database["public"]['Enums']["media_type"],"property_id"?: string,"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "property_media_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "property_media_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "public_properties"
      referencedColumns: ["id"]
    }
                  ]
                },"property_ownership": {
                  Row: {
                    "authorization_end": string | null,"authorization_start": string | null,"authorization_status": Database["public"]['Enums']["authorization_status"],"created_at": string,"id": string,"landlord_id": string,"property_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "authorization_end"?: string | null,"authorization_start"?: string | null,"authorization_status"?: Database["public"]['Enums']["authorization_status"],"created_at"?: string,"id"?: string,"landlord_id": string,"property_id": string
                  }
                  Update: {
                    "authorization_end"?: string | null,"authorization_start"?: string | null,"authorization_status"?: Database["public"]['Enums']["authorization_status"],"created_at"?: string,"id"?: string,"landlord_id"?: string,"property_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "property_ownership_landlord_id_fkey"
      columns: ["landlord_id"]
isOneToOne: false
      referencedRelation: "landlords"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "property_ownership_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "property_ownership_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "public_properties"
      referencedColumns: ["id"]
    }
                  ]
                },"property_translations": {
                  Row: {
                    "amenities": (string)[],"created_at": string,"description": string | null,"id": string,"locale": Database["public"]['Enums']["locale_code"],"property_id": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amenities"?: (string)[],"created_at"?: string,"description"?: string | null,"id"?: string,"locale": Database["public"]['Enums']["locale_code"],"property_id": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "amenities"?: (string)[],"created_at"?: string,"description"?: string | null,"id"?: string,"locale"?: Database["public"]['Enums']["locale_code"],"property_id"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "property_translations_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "property_translations_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "public_properties"
      referencedColumns: ["id"]
    }
                  ]
                },"rental_deals": {
                  Row: {
                    "advance_rent_minor": number | null,"agent_id": string,"agent_share_expected_minor": number | null,"agent_share_fixed_minor": number | null,"agent_share_method": Database["public"]['Enums']["agent_share_method"],"agent_share_rate": number | null,"agreed_monthly_rent_minor": number | null,"agreement_reference": string | null,"closed_at": string | null,"closing_date": string | null,"commission_expected_minor": number | null,"commission_fixed_minor": number | null,"commission_method": Database["public"]['Enums']["commission_method"] | null,"commission_rate": number | null,"created_at": string,"currency": Database["public"]['Enums']["currency_code"],"deposit_minor": number | null,"id": string,"landlord_id": string | null,"lead_id": string,"lease_end": string | null,"lease_months": number | null,"lease_start": string | null,"notes": string | null,"property_id": string,"stage": Database["public"]['Enums']["deal_stage"],"status_reason": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "advance_rent_minor"?: number | null,"agent_id": string,"agent_share_expected_minor"?: number | null,"agent_share_fixed_minor"?: number | null,"agent_share_method"?: Database["public"]['Enums']["agent_share_method"],"agent_share_rate"?: number | null,"agreed_monthly_rent_minor"?: number | null,"agreement_reference"?: string | null,"closed_at"?: string | null,"closing_date"?: string | null,"commission_expected_minor"?: number | null,"commission_fixed_minor"?: number | null,"commission_method"?: Database["public"]['Enums']["commission_method"] | null,"commission_rate"?: number | null,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency_code"],"deposit_minor"?: number | null,"id"?: string,"landlord_id"?: string | null,"lead_id": string,"lease_end"?: string | null,"lease_months"?: number | null,"lease_start"?: string | null,"notes"?: string | null,"property_id": string,"stage"?: Database["public"]['Enums']["deal_stage"],"status_reason"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "advance_rent_minor"?: number | null,"agent_id"?: string,"agent_share_expected_minor"?: number | null,"agent_share_fixed_minor"?: number | null,"agent_share_method"?: Database["public"]['Enums']["agent_share_method"],"agent_share_rate"?: number | null,"agreed_monthly_rent_minor"?: number | null,"agreement_reference"?: string | null,"closed_at"?: string | null,"closing_date"?: string | null,"commission_expected_minor"?: number | null,"commission_fixed_minor"?: number | null,"commission_method"?: Database["public"]['Enums']["commission_method"] | null,"commission_rate"?: number | null,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency_code"],"deposit_minor"?: number | null,"id"?: string,"landlord_id"?: string | null,"lead_id"?: string,"lease_end"?: string | null,"lease_months"?: number | null,"lease_start"?: string | null,"notes"?: string | null,"property_id"?: string,"stage"?: Database["public"]['Enums']["deal_stage"],"status_reason"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rental_deals_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rental_deals_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rental_deals_landlord_id_fkey"
      columns: ["landlord_id"]
isOneToOne: false
      referencedRelation: "landlords"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rental_deals_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "crm_lead_list"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rental_deals_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rental_deals_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rental_deals_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "public_properties"
      referencedColumns: ["id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "assigned_to": string | null,"automation_key": string | null,"completed_at": string | null,"created_at": string,"created_by": string | null,"deal_id": string | null,"description": string | null,"due_at": string | null,"id": string,"lead_id": string | null,"priority": Database["public"]['Enums']["task_priority"],"property_id": string | null,"source": string | null,"status": Database["public"]['Enums']["task_status"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_to"?: string | null,"automation_key"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"deal_id"?: string | null,"description"?: string | null,"due_at"?: string | null,"id"?: string,"lead_id"?: string | null,"priority"?: Database["public"]['Enums']["task_priority"],"property_id"?: string | null,"source"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "assigned_to"?: string | null,"automation_key"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"deal_id"?: string | null,"description"?: string | null,"due_at"?: string | null,"id"?: string,"lead_id"?: string | null,"priority"?: Database["public"]['Enums']["task_priority"],"property_id"?: string | null,"source"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deal_financials"
      referencedColumns: ["deal_id"]
    },{
      foreignKeyName: "tasks_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deal_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "rental_deals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "crm_lead_list"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "public_properties"
      referencedColumns: ["id"]
    }
                  ]
                },"viewing_appointments": {
                  Row: {
                    "agent_id": string,"created_at": string,"id": string,"lead_id": string,"notes": string | null,"outcome": Database["public"]['Enums']["viewing_outcome"] | null,"property_id": string,"scheduled_at": string,"status": Database["public"]['Enums']["viewing_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id": string,"created_at"?: string,"id"?: string,"lead_id": string,"notes"?: string | null,"outcome"?: Database["public"]['Enums']["viewing_outcome"] | null,"property_id": string,"scheduled_at": string,"status"?: Database["public"]['Enums']["viewing_status"],"updated_at"?: string
                  }
                  Update: {
                    "agent_id"?: string,"created_at"?: string,"id"?: string,"lead_id"?: string,"notes"?: string | null,"outcome"?: Database["public"]['Enums']["viewing_outcome"] | null,"property_id"?: string,"scheduled_at"?: string,"status"?: Database["public"]['Enums']["viewing_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "viewing_appointments_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "viewing_appointments_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "viewing_appointments_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "crm_lead_list"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "viewing_appointments_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "viewing_appointments_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "viewing_appointments_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "public_properties"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "commission_balances": {
                  Row: {
                    "agent_id": string | null,"collected_minor": number | null,"collection_status": string | null,"commission_id": string | null,"currency": Database["public"]['Enums']["currency_code"] | null,"customer_name": string | null,"deal_id": string | null,"due_date": string | null,"due_minor": number | null,"invoiced_on": string | null,"last_payment_method": Database["public"]['Enums']["payment_method"] | null,"last_payment_on": string | null,"last_payment_reference": string | null,"lead_id": string | null,"notes": string | null,"outstanding_minor": number | null,"payer": Database["public"]['Enums']["fee_payer"] | null,"property_reference": string | null,"property_type": Database["public"]['Enums']["property_type"] | null,"written_off_minor": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "commissions_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deal_financials"
      referencedColumns: ["deal_id"]
    },{
      foreignKeyName: "commissions_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deal_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "commissions_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "rental_deals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rental_deals_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rental_deals_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rental_deals_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "crm_lead_list"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rental_deals_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    }
                  ]
                },"crm_lead_list": {
                  Row: {
                    "agent_name": string | null,"assigned_agent_id": string | null,"created_at": string | null,"customer_name": string | null,"email": string | null,"id": string | null,"next_follow_up_at": string | null,"phone": string | null,"preferred_area": string | null,"preferred_language": Database["public"]['Enums']["locale_code"] | null,"property_category": Database["public"]['Enums']["property_category"] | null,"property_district": string | null,"property_id": string | null,"property_reference": string | null,"property_type": Database["public"]['Enums']["property_type"] | null,"sla_breached_at": string | null,"source": Database["public"]['Enums']["lead_source"] | null,"stage": Database["public"]['Enums']["lead_stage"] | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "leads_assigned_agent_id_fkey"
      columns: ["assigned_agent_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_assigned_agent_id_fkey"
      columns: ["assigned_agent_id"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "public_properties"
      referencedColumns: ["id"]
    }
                  ]
                },"deal_financials": {
                  Row: {
                    "agent_eligible_minor": number | null,"agent_id": string | null,"agent_outstanding_minor": number | null,"agent_paid_minor": number | null,"agent_pending_minor": number | null,"agent_share_minor": number | null,"closing_date": string | null,"collected_minor": number | null,"currency": Database["public"]['Enums']["currency_code"] | null,"deal_id": string | null,"earned_minor": number | null,"expected_minor": number | null,"invoiced_minor": number | null,"outstanding_minor": number | null,"receivable_minor": number | null,"stage": Database["public"]['Enums']["deal_stage"] | null,"written_off_minor": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "rental_deals_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rental_deals_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    }
                  ]
                },"deal_overview": {
                  Row: {
                    "advance_rent_minor": number | null,"agent_id": string | null,"agent_name": string | null,"agent_share_expected_minor": number | null,"agreed_monthly_rent_minor": number | null,"agreement_reference": string | null,"closing_date": string | null,"commission_expected_minor": number | null,"commission_method": Database["public"]['Enums']["commission_method"] | null,"created_at": string | null,"currency": Database["public"]['Enums']["currency_code"] | null,"customer_name": string | null,"deposit_minor": number | null,"id": string | null,"landlord_id": string | null,"landlord_name": string | null,"lead_id": string | null,"lease_end": string | null,"lease_months": number | null,"lease_start": string | null,"property_id": string | null,"property_reference": string | null,"property_type": Database["public"]['Enums']["property_type"] | null,"stage": Database["public"]['Enums']["deal_stage"] | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "rental_deals_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rental_deals_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "staff_names"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rental_deals_landlord_id_fkey"
      columns: ["landlord_id"]
isOneToOne: false
      referencedRelation: "landlords"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rental_deals_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "crm_lead_list"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rental_deals_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rental_deals_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rental_deals_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "public_properties"
      referencedColumns: ["id"]
    }
                  ]
                },"public_properties": {
                  Row: {
                    "area_unit": Database["public"]['Enums']["area_unit"] | null,"availability_status": Database["public"]['Enums']["availability_status"] | null,"available_from": string | null,"bathrooms": number | null,"bedrooms": number | null,"category": Database["public"]['Enums']["property_category"] | null,"city": string | null,"created_at": string | null,"currency": Database["public"]['Enums']["currency_code"] | null,"deposit_amount_minor": number | null,"district": string | null,"floor_area": number | null,"furnishing_status": Database["public"]['Enums']["furnishing_status"] | null,"id": string | null,"lease_terms": string | null,"listing_code": string | null,"monthly_rent_minor": number | null,"neighborhood": string | null,"property_type": Database["public"]['Enums']["property_type"] | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "area_unit"?: Database["public"]['Enums']["area_unit"] | null,"availability_status"?: Database["public"]['Enums']["availability_status"] | null,"available_from"?: string | null,"bathrooms"?: number | null,"bedrooms"?: number | null,"category"?: Database["public"]['Enums']["property_category"] | null,"city"?: string | null,"created_at"?: string | null,"currency"?: Database["public"]['Enums']["currency_code"] | null,"deposit_amount_minor"?: number | null,"district"?: string | null,"floor_area"?: number | null,"furnishing_status"?: Database["public"]['Enums']["furnishing_status"] | null,"id"?: string | null,"lease_terms"?: string | null,"listing_code"?: string | null,"monthly_rent_minor"?: number | null,"neighborhood"?: string | null,"property_type"?: Database["public"]['Enums']["property_type"] | null,"updated_at"?: string | null
                         }
                        Update: {
                           "area_unit"?: Database["public"]['Enums']["area_unit"] | null,"availability_status"?: Database["public"]['Enums']["availability_status"] | null,"available_from"?: string | null,"bathrooms"?: number | null,"bedrooms"?: number | null,"category"?: Database["public"]['Enums']["property_category"] | null,"city"?: string | null,"created_at"?: string | null,"currency"?: Database["public"]['Enums']["currency_code"] | null,"deposit_amount_minor"?: number | null,"district"?: string | null,"floor_area"?: number | null,"furnishing_status"?: Database["public"]['Enums']["furnishing_status"] | null,"id"?: string | null,"lease_terms"?: string | null,"listing_code"?: string | null,"monthly_rent_minor"?: number | null,"neighborhood"?: string | null,"property_type"?: Database["public"]['Enums']["property_type"] | null,"updated_at"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"public_property_media": {
                  Row: {
                    "caption": string | null,"display_order": number | null,"id": string | null,"is_cover": boolean | null,"media_type": Database["public"]['Enums']["media_type"] | null,"property_id": string | null,"storage_path": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "property_media_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "property_media_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "public_properties"
      referencedColumns: ["id"]
    }
                  ]
                },"public_property_translations": {
                  Row: {
                    "amenities": (string)[] | null,"description": string | null,"locale": Database["public"]['Enums']["locale_code"] | null,"property_id": string | null,"title": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "property_translations_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "property_translations_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "public_properties"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_names": {
                  Row: {
                    "full_name": string | null,"id": string | null,"role": Database["public"]['Enums']["staff_role"] | null
                  }
                  ComputedFields: never
                  Insert: {
                           "full_name"?: string | null,"id"?: string | null,"role"?: Database["public"]['Enums']["staff_role"] | null
                         }
                        Update: {
                           "full_name"?: string | null,"id"?: string | null,"role"?: Database["public"]['Enums']["staff_role"] | null
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "crm_agent_performance":
{ Args: { "month_end": string,"month_start": string }; Returns: {
              "active_leads": number,"agent_id": string,"agent_name": string,"leads_received": number,"leads_won": number,"viewings_done": number
            }[]
                           },
"crm_dashboard_summary":
{ Args: { "day_end": string,"day_start": string,"month_end": string,"month_start": string }; Returns: Json
                           },
"finance_report":
{ Args: { "from_date": string,"to_date": string }; Returns: Json
                           },
"log_financial_export":
{ Args: { "details"?: Json,"report": string }; Returns: undefined
                           },
"retry_automation_event":
{ Args: { "event": string }; Returns: string
                           },
"run_automation_now":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"run_automation_scheduled":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"set_staff_role":
{ Args: { "make_active"?: boolean,"new_role": Database["public"]['Enums']["staff_role"],"target_user": string }; Returns: undefined
                           }
          }
          Enums: {
            "activity_type": "note"|"call"|"message"|"email"|"meeting"|"stage_change"|"assignment"|"viewing","agent_share_method": "none"|"percent_of_commission"|"fixed_amount","area_unit": "sqm"|"sqft","authorization_status": "pending"|"active"|"expired"|"revoked","availability_status": "available"|"available_from"|"reserved"|"rented"|"off_market","commission_calculation": "percentage_of_rent"|"months_of_rent"|"fixed_amount","commission_earned_rule": "on_closed_won"|"on_collection","commission_method": "fixed_amount"|"percent_of_monthly_rent"|"percent_of_total_rent"|"custom_amount","commission_payment_status": "pending"|"partial"|"paid"|"overdue"|"waived","currency_code": "USD"|"KHR","deal_stage": "negotiation"|"reserved"|"lease_signed"|"commission_invoiced"|"commission_collected"|"lost"|"agreement_pending"|"closed_won"|"closed_lost"|"cancelled"|"lease_expired","document_kind": "agreement"|"receipt"|"other","document_type": "listing_sheet"|"inquiry_summary"|"viewing_confirmation"|"deal_summary"|"commission_statement"|"payout_statement"|"landlord_submission"|"agreement_draft","expense_category": "advertising"|"transportation"|"office_rent"|"staff_costs"|"marketing_materials"|"utilities"|"other","expense_status": "pending"|"approved"|"rejected","fee_payer": "landlord"|"tenant"|"other","furnishing_status": "unfurnished"|"partially_furnished"|"fully_furnished","lead_source": "website_form"|"phone"|"walk_in"|"referral"|"social_media"|"partner_agent"|"other","lead_stage": "new"|"contacted"|"qualified"|"viewing_scheduled"|"viewed"|"negotiation"|"won"|"lost"|"reserved"|"unresponsive"|"on_hold"|"cancelled","ledger_entry_type": "payment"|"reversal"|"write_off"|"adjustment_up"|"adjustment_down","locale_code": "en"|"km"|"zh","media_type": "image"|"video"|"floor_plan","notification_type": "lead_assigned"|"lead_reassigned"|"lead_unassigned"|"lead_sla_breached"|"viewing_scheduled"|"viewing_upcoming"|"viewing_rescheduled"|"task_assigned"|"task_overdue"|"payout_updated"|"commission_updated"|"lease_expiring","payment_method": "cash"|"bank_transfer"|"aba"|"wing"|"other","payout_eligibility_rule": "on_collected"|"on_earned","payout_status": "pending_approval"|"approved"|"paid"|"rejected"|"cancelled"|"reversed","property_category": "residential"|"commercial","property_type": "apartment"|"condo"|"serviced_apartment"|"villa"|"house"|"flat"|"office"|"retail_shop"|"shophouse"|"warehouse"|"commercial_space","publication_status": "draft"|"submitted"|"in_review"|"changes_requested"|"published"|"unpublished"|"archived","staff_role": "super_admin"|"manager"|"agent"|"marketing"|"finance","submission_status": "new"|"contacted"|"accepted"|"declined"|"spam","submitter_relationship": "owner"|"authorized_representative"|"developer"|"other_agent"|"other","task_priority": "low"|"normal"|"high"|"urgent","task_status": "todo"|"in_progress"|"done"|"cancelled","verification_status": "unverified"|"pending"|"verified"|"rejected","viewing_outcome": "interested"|"not_interested"|"needs_follow_up"|"wants_another_viewing","viewing_status": "scheduled"|"confirmed"|"completed"|"cancelled"|"no_show"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "activity_type": ["note", "call", "message", "email", "meeting", "stage_change", "assignment", "viewing"],"agent_share_method": ["none", "percent_of_commission", "fixed_amount"],"area_unit": ["sqm", "sqft"],"authorization_status": ["pending", "active", "expired", "revoked"],"availability_status": ["available", "available_from", "reserved", "rented", "off_market"],"commission_calculation": ["percentage_of_rent", "months_of_rent", "fixed_amount"],"commission_earned_rule": ["on_closed_won", "on_collection"],"commission_method": ["fixed_amount", "percent_of_monthly_rent", "percent_of_total_rent", "custom_amount"],"commission_payment_status": ["pending", "partial", "paid", "overdue", "waived"],"currency_code": ["USD", "KHR"],"deal_stage": ["negotiation", "reserved", "lease_signed", "commission_invoiced", "commission_collected", "lost", "agreement_pending", "closed_won", "closed_lost", "cancelled", "lease_expired"],"document_kind": ["agreement", "receipt", "other"],"document_type": ["listing_sheet", "inquiry_summary", "viewing_confirmation", "deal_summary", "commission_statement", "payout_statement", "landlord_submission", "agreement_draft"],"expense_category": ["advertising", "transportation", "office_rent", "staff_costs", "marketing_materials", "utilities", "other"],"expense_status": ["pending", "approved", "rejected"],"fee_payer": ["landlord", "tenant", "other"],"furnishing_status": ["unfurnished", "partially_furnished", "fully_furnished"],"lead_source": ["website_form", "phone", "walk_in", "referral", "social_media", "partner_agent", "other"],"lead_stage": ["new", "contacted", "qualified", "viewing_scheduled", "viewed", "negotiation", "won", "lost", "reserved", "unresponsive", "on_hold", "cancelled"],"ledger_entry_type": ["payment", "reversal", "write_off", "adjustment_up", "adjustment_down"],"locale_code": ["en", "km", "zh"],"media_type": ["image", "video", "floor_plan"],"notification_type": ["lead_assigned", "lead_reassigned", "lead_unassigned", "lead_sla_breached", "viewing_scheduled", "viewing_upcoming", "viewing_rescheduled", "task_assigned", "task_overdue", "payout_updated", "commission_updated", "lease_expiring"],"payment_method": ["cash", "bank_transfer", "aba", "wing", "other"],"payout_eligibility_rule": ["on_collected", "on_earned"],"payout_status": ["pending_approval", "approved", "paid", "rejected", "cancelled", "reversed"],"property_category": ["residential", "commercial"],"property_type": ["apartment", "condo", "serviced_apartment", "villa", "house", "flat", "office", "retail_shop", "shophouse", "warehouse", "commercial_space"],"publication_status": ["draft", "submitted", "in_review", "changes_requested", "published", "unpublished", "archived"],"staff_role": ["super_admin", "manager", "agent", "marketing", "finance"],"submission_status": ["new", "contacted", "accepted", "declined", "spam"],"submitter_relationship": ["owner", "authorized_representative", "developer", "other_agent", "other"],"task_priority": ["low", "normal", "high", "urgent"],"task_status": ["todo", "in_progress", "done", "cancelled"],"verification_status": ["unverified", "pending", "verified", "rejected"],"viewing_outcome": ["interested", "not_interested", "needs_follow_up", "wants_another_viewing"],"viewing_status": ["scheduled", "confirmed", "completed", "cancelled", "no_show"]
          }
        }
} as const
