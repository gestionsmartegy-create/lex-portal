// ============================================================================
// FICHIER GÉNÉRÉ — NE PAS MODIFIER À LA MAIN (AGENTS.md §3)
// Source : migrations supabase/migrations/* · Commande : pnpm db:types
// Seul le schéma public (exposé à l'API) est typé ; private et audit ne le sont pas.
// ============================================================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "appointments": {
                  Row: {
                    "clio_calendar_entry_id": string | null,"created_at": string,"description": string | null,"ends_at": string | null,"id": string,"last_synced_at": string | null,"location": string | null,"matter_id": string,"meeting_url": string | null,"starts_at": string,"status": Database["public"]['Enums']["appointment_status"],"timezone": string,"title": string,"updated_at": string,"with_staff_name": string | null
                  }
                  Insert: {
                    "clio_calendar_entry_id"?: string | null,"created_at"?: string,"description"?: string | null,"ends_at"?: string | null,"id"?: string,"last_synced_at"?: string | null,"location"?: string | null,"matter_id": string,"meeting_url"?: string | null,"starts_at": string,"status"?: Database["public"]['Enums']["appointment_status"],"timezone"?: string,"title": string,"updated_at"?: string,"with_staff_name"?: string | null
                  }
                  Update: {
                    "clio_calendar_entry_id"?: string | null,"created_at"?: string,"description"?: string | null,"ends_at"?: string | null,"id"?: string,"last_synced_at"?: string | null,"location"?: string | null,"matter_id"?: string,"meeting_url"?: string | null,"starts_at"?: string,"status"?: Database["public"]['Enums']["appointment_status"],"timezone"?: string,"title"?: string,"updated_at"?: string,"with_staff_name"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "appointments_matter_id_fkey"
      columns: ["matter_id"]
isOneToOne: false
      referencedRelation: "matters"
      referencedColumns: ["id"]
    }
                  ]
                },"client_invitation_matters": {
                  Row: {
                    "access_level": Database["public"]['Enums']["access_level"],"invitation_id": string,"matter_id": string
                  }
                  Insert: {
                    "access_level"?: Database["public"]['Enums']["access_level"],"invitation_id": string,"matter_id": string
                  }
                  Update: {
                    "access_level"?: Database["public"]['Enums']["access_level"],"invitation_id"?: string,"matter_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_invitation_matters_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "client_invitations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "client_invitation_matters_matter_id_fkey"
      columns: ["matter_id"]
isOneToOne: false
      referencedRelation: "matters"
      referencedColumns: ["id"]
    }
                  ]
                },"client_invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_user_id": string | null,"clio_contact_id": string | null,"created_at": string,"email": string,"expires_at": string,"first_name": string | null,"id": string,"invited_by": string | null,"last_name": string | null,"organization_id": string | null,"preferred_language": string,"revoked_at": string | null,"status": Database["public"]['Enums']["invitation_status"],"token_hash": string
                  }
                  Insert: {
                    "accepted_at"?: string | null,"accepted_user_id"?: string | null,"clio_contact_id"?: string | null,"created_at"?: string,"email": string,"expires_at"?: string,"first_name"?: string | null,"id"?: string,"invited_by"?: string | null,"last_name"?: string | null,"organization_id"?: string | null,"preferred_language"?: string,"revoked_at"?: string | null,"status"?: Database["public"]['Enums']["invitation_status"],"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_user_id"?: string | null,"clio_contact_id"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"first_name"?: string | null,"id"?: string,"invited_by"?: string | null,"last_name"?: string | null,"organization_id"?: string | null,"preferred_language"?: string,"revoked_at"?: string | null,"status"?: Database["public"]['Enums']["invitation_status"],"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_invitations_accepted_user_id_fkey"
      columns: ["accepted_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "client_invitations_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "client_invitations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"conversation_participants": {
                  Row: {
                    "added_at": string,"conversation_id": string,"last_read_at": string | null,"user_id": string
                  }
                  Insert: {
                    "added_at"?: string,"conversation_id": string,"last_read_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "added_at"?: string,"conversation_id"?: string,"last_read_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversation_participants_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversation_participants_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"conversations": {
                  Row: {
                    "closed_at": string | null,"created_at": string,"created_by": string | null,"id": string,"last_message_at": string | null,"matter_id": string | null,"scope": Database["public"]['Enums']["conversation_scope"],"subject": string | null
                  }
                  Insert: {
                    "closed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"last_message_at"?: string | null,"matter_id"?: string | null,"scope"?: Database["public"]['Enums']["conversation_scope"],"subject"?: string | null
                  }
                  Update: {
                    "closed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"last_message_at"?: string | null,"matter_id"?: string | null,"scope"?: Database["public"]['Enums']["conversation_scope"],"subject"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_matter_id_fkey"
      columns: ["matter_id"]
isOneToOne: false
      referencedRelation: "matters"
      referencedColumns: ["id"]
    }
                  ]
                },"document_requests": {
                  Row: {
                    "created_at": string,"description": string | null,"due_date": string | null,"fulfilled_at": string | null,"fulfilled_document_id": string | null,"id": string,"matter_id": string,"requested_by": string | null,"requested_from": string,"status": Database["public"]['Enums']["request_status"],"title": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"due_date"?: string | null,"fulfilled_at"?: string | null,"fulfilled_document_id"?: string | null,"id"?: string,"matter_id": string,"requested_by"?: string | null,"requested_from": string,"status"?: Database["public"]['Enums']["request_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"due_date"?: string | null,"fulfilled_at"?: string | null,"fulfilled_document_id"?: string | null,"id"?: string,"matter_id"?: string,"requested_by"?: string | null,"requested_from"?: string,"status"?: Database["public"]['Enums']["request_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_requests_fulfilled_document_id_fkey"
      columns: ["fulfilled_document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_requests_matter_id_fkey"
      columns: ["matter_id"]
isOneToOne: false
      referencedRelation: "matters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_requests_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_requests_requested_from_fkey"
      columns: ["requested_from"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"documents": {
                  Row: {
                    "category": string | null,"created_at": string,"deleted_at": string | null,"display_name": string,"external_drive_id": string | null,"external_etag": string | null,"external_item_id": string | null,"folder": Database["public"]['Enums']["document_folder"],"id": string,"last_synced_at": string | null,"matter_id": string,"mime_type": string | null,"provider": Database["public"]['Enums']["document_provider"],"scan_status": Database["public"]['Enums']["scan_status"],"sha256": string | null,"size_bytes": number | null,"status": Database["public"]['Enums']["document_status"],"storage_path": string | null,"updated_at": string,"uploaded_at": string,"uploaded_by": string | null
                  }
                  Insert: {
                    "category"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"display_name": string,"external_drive_id"?: string | null,"external_etag"?: string | null,"external_item_id"?: string | null,"folder"?: Database["public"]['Enums']["document_folder"],"id"?: string,"last_synced_at"?: string | null,"matter_id": string,"mime_type"?: string | null,"provider": Database["public"]['Enums']["document_provider"],"scan_status"?: Database["public"]['Enums']["scan_status"],"sha256"?: string | null,"size_bytes"?: number | null,"status"?: Database["public"]['Enums']["document_status"],"storage_path"?: string | null,"updated_at"?: string,"uploaded_at"?: string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "category"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"display_name"?: string,"external_drive_id"?: string | null,"external_etag"?: string | null,"external_item_id"?: string | null,"folder"?: Database["public"]['Enums']["document_folder"],"id"?: string,"last_synced_at"?: string | null,"matter_id"?: string,"mime_type"?: string | null,"provider"?: Database["public"]['Enums']["document_provider"],"scan_status"?: Database["public"]['Enums']["scan_status"],"sha256"?: string | null,"size_bytes"?: number | null,"status"?: Database["public"]['Enums']["document_status"],"storage_path"?: string | null,"updated_at"?: string,"uploaded_at"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "documents_matter_id_fkey"
      columns: ["matter_id"]
isOneToOne: false
      referencedRelation: "matters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"external_accounts": {
                  Row: {
                    "created_at": string,"external_id": string,"external_region": string | null,"id": string,"metadata": NonNullable<Json>,"provider": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"external_id": string,"external_region"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"provider": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"external_id"?: string,"external_region"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"provider"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "external_accounts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"invoices": {
                  Row: {
                    "amount_total": number,"balance_due": number,"clio_bill_id": string | null,"clio_state": string | null,"created_at": string,"currency": string,"due_at": string | null,"id": string,"invoice_number": string,"issued_at": string | null,"last_synced_at": string | null,"matter_id": string,"status": Database["public"]['Enums']["invoice_status"],"updated_at": string
                  }
                  Insert: {
                    "amount_total": number,"balance_due": number,"clio_bill_id"?: string | null,"clio_state"?: string | null,"created_at"?: string,"currency"?: string,"due_at"?: string | null,"id"?: string,"invoice_number": string,"issued_at"?: string | null,"last_synced_at"?: string | null,"matter_id": string,"status"?: Database["public"]['Enums']["invoice_status"],"updated_at"?: string
                  }
                  Update: {
                    "amount_total"?: number,"balance_due"?: number,"clio_bill_id"?: string | null,"clio_state"?: string | null,"created_at"?: string,"currency"?: string,"due_at"?: string | null,"id"?: string,"invoice_number"?: string,"issued_at"?: string | null,"last_synced_at"?: string | null,"matter_id"?: string,"status"?: Database["public"]['Enums']["invoice_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_matter_id_fkey"
      columns: ["matter_id"]
isOneToOne: false
      referencedRelation: "matters"
      referencedColumns: ["id"]
    }
                  ]
                },"matter_access": {
                  Row: {
                    "access_level": Database["public"]['Enums']["access_level"],"granted_at": string,"granted_by": string | null,"id": string,"matter_id": string,"revoke_reason": string | null,"revoked_at": string | null,"revoked_by": string | null,"user_id": string
                  }
                  Insert: {
                    "access_level"?: Database["public"]['Enums']["access_level"],"granted_at"?: string,"granted_by"?: string | null,"id"?: string,"matter_id": string,"revoke_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"user_id": string
                  }
                  Update: {
                    "access_level"?: Database["public"]['Enums']["access_level"],"granted_at"?: string,"granted_by"?: string | null,"id"?: string,"matter_id"?: string,"revoke_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "matter_access_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "matter_access_matter_id_fkey"
      columns: ["matter_id"]
isOneToOne: false
      referencedRelation: "matters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "matter_access_revoked_by_fkey"
      columns: ["revoked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "matter_access_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"matter_team": {
                  Row: {
                    "created_at": string,"matter_id": string,"role": Database["public"]['Enums']["team_role"],"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"matter_id": string,"role"?: Database["public"]['Enums']["team_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"matter_id"?: string,"role"?: Database["public"]['Enums']["team_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "matter_team_matter_id_fkey"
      columns: ["matter_id"]
isOneToOne: false
      referencedRelation: "matters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "matter_team_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"matter_timeline_steps": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"description": string | null,"id": string,"is_completed": boolean,"matter_id": string,"position": number,"title": string,"updated_at": string
                  }
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"is_completed"?: boolean,"matter_id": string,"position": number,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"is_completed"?: boolean,"matter_id"?: string,"position"?: number,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "matter_timeline_steps_matter_id_fkey"
      columns: ["matter_id"]
isOneToOne: false
      referencedRelation: "matters"
      referencedColumns: ["id"]
    }
                  ]
                },"matters": {
                  Row: {
                    "clio_matter_id": string | null,"closed_at": string | null,"created_at": string,"description": string | null,"display_number": string | null,"id": string,"is_mock": boolean,"last_synced_at": string | null,"opened_at": string | null,"practice_area": string | null,"progress_percent": number | null,"purged_at": string | null,"responsible_name": string | null,"responsible_staff_id": string | null,"status": Database["public"]['Enums']["matter_status"],"title": string,"updated_at": string
                  }
                  Insert: {
                    "clio_matter_id"?: string | null,"closed_at"?: string | null,"created_at"?: string,"description"?: string | null,"display_number"?: string | null,"id"?: string,"is_mock"?: boolean,"last_synced_at"?: string | null,"opened_at"?: string | null,"practice_area"?: string | null,"progress_percent"?: number | null,"purged_at"?: string | null,"responsible_name"?: string | null,"responsible_staff_id"?: string | null,"status"?: Database["public"]['Enums']["matter_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "clio_matter_id"?: string | null,"closed_at"?: string | null,"created_at"?: string,"description"?: string | null,"display_number"?: string | null,"id"?: string,"is_mock"?: boolean,"last_synced_at"?: string | null,"opened_at"?: string | null,"practice_area"?: string | null,"progress_percent"?: number | null,"purged_at"?: string | null,"responsible_name"?: string | null,"responsible_staff_id"?: string | null,"status"?: Database["public"]['Enums']["matter_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "matters_responsible_staff_id_fkey"
      columns: ["responsible_staff_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"message_attachments": {
                  Row: {
                    "document_id": string,"message_id": string
                  }
                  Insert: {
                    "document_id": string,"message_id": string
                  }
                  Update: {
                    "document_id"?: string,"message_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_attachments_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_attachments_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "body": string,"conversation_id": string,"created_at": string,"id": string,"sender_id": string
                  }
                  Insert: {
                    "body": string,"conversation_id": string,"created_at"?: string,"id"?: string,"sender_id": string
                  }
                  Update: {
                    "body"?: string,"conversation_id"?: string,"created_at"?: string,"id"?: string,"sender_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_preferences": {
                  Row: {
                    "email_enabled": boolean,"in_app_enabled": boolean,"sms_enabled": boolean,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "email_enabled"?: boolean,"in_app_enabled"?: boolean,"sms_enabled"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "email_enabled"?: boolean,"in_app_enabled"?: boolean,"sms_enabled"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "action_url": string | null,"body": string | null,"created_at": string,"emailed_at": string | null,"id": string,"matter_id": string | null,"priority": Database["public"]['Enums']["notification_priority"],"read_at": string | null,"reference_id": string | null,"reference_type": string | null,"title": string,"type": Database["public"]['Enums']["notification_type"],"user_id": string
                  }
                  Insert: {
                    "action_url"?: string | null,"body"?: string | null,"created_at"?: string,"emailed_at"?: string | null,"id"?: string,"matter_id"?: string | null,"priority"?: Database["public"]['Enums']["notification_priority"],"read_at"?: string | null,"reference_id"?: string | null,"reference_type"?: string | null,"title": string,"type": Database["public"]['Enums']["notification_type"],"user_id": string
                  }
                  Update: {
                    "action_url"?: string | null,"body"?: string | null,"created_at"?: string,"emailed_at"?: string | null,"id"?: string,"matter_id"?: string | null,"priority"?: Database["public"]['Enums']["notification_priority"],"read_at"?: string | null,"reference_id"?: string | null,"reference_type"?: string | null,"title"?: string,"type"?: Database["public"]['Enums']["notification_type"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_matter_id_fkey"
      columns: ["matter_id"]
isOneToOne: false
      referencedRelation: "matters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_members": {
                  Row: {
                    "created_at": string,"organization_id": string,"role": Database["public"]['Enums']["org_member_role"],"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"organization_id": string,"role"?: Database["public"]['Enums']["org_member_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"organization_id"?: string,"role"?: Database["public"]['Enums']["org_member_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_members_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "clio_contact_id": string | null,"created_at": string,"id": string,"name": string,"type": Database["public"]['Enums']["org_type"],"updated_at": string
                  }
                  Insert: {
                    "clio_contact_id"?: string | null,"created_at"?: string,"id"?: string,"name": string,"type"?: Database["public"]['Enums']["org_type"],"updated_at"?: string
                  }
                  Update: {
                    "clio_contact_id"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"type"?: Database["public"]['Enums']["org_type"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"created_at": string,"currency": string,"failure_code": string | null,"id": string,"idempotency_key": string,"invoice_id": string,"payer_id": string | null,"provider": string,"provider_reference": string | null,"status": Database["public"]['Enums']["payment_status"],"succeeded_at": string | null,"updated_at": string
                  }
                  Insert: {
                    "amount": number,"created_at"?: string,"currency"?: string,"failure_code"?: string | null,"id"?: string,"idempotency_key": string,"invoice_id": string,"payer_id"?: string | null,"provider": string,"provider_reference"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"succeeded_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"currency"?: string,"failure_code"?: string | null,"id"?: string,"idempotency_key"?: string,"invoice_id"?: string,"payer_id"?: string | null,"provider"?: string,"provider_reference"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"succeeded_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_payer_id_fkey"
      columns: ["payer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "client_number": string | null,"created_at": string,"email": string,"first_name": string | null,"id": string,"last_name": string | null,"last_seen_at": string | null,"phone": string | null,"preferred_language": string,"role": Database["public"]['Enums']["app_role"],"status": Database["public"]['Enums']["user_status"],"title": string | null,"updated_at": string
                  }
                  Insert: {
                    "client_number"?: string | null,"created_at"?: string,"email": string,"first_name"?: string | null,"id": string,"last_name"?: string | null,"last_seen_at"?: string | null,"phone"?: string | null,"preferred_language"?: string,"role"?: Database["public"]['Enums']["app_role"],"status"?: Database["public"]['Enums']["user_status"],"title"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "client_number"?: string | null,"created_at"?: string,"email"?: string,"first_name"?: string | null,"id"?: string,"last_name"?: string | null,"last_seen_at"?: string | null,"phone"?: string | null,"preferred_language"?: string,"role"?: Database["public"]['Enums']["app_role"],"status"?: Database["public"]['Enums']["user_status"],"title"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"signature_requests": {
                  Row: {
                    "created_at": string,"document_id": string,"due_at": string | null,"id": string,"matter_id": string,"provider": string,"provider_envelope_id": string | null,"requested_by": string | null,"sent_at": string | null,"signed_at": string | null,"signer_id": string,"status": Database["public"]['Enums']["signature_status"],"updated_at": string,"viewed_at": string | null
                  }
                  Insert: {
                    "created_at"?: string,"document_id": string,"due_at"?: string | null,"id"?: string,"matter_id": string,"provider"?: string,"provider_envelope_id"?: string | null,"requested_by"?: string | null,"sent_at"?: string | null,"signed_at"?: string | null,"signer_id": string,"status"?: Database["public"]['Enums']["signature_status"],"updated_at"?: string,"viewed_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"document_id"?: string,"due_at"?: string | null,"id"?: string,"matter_id"?: string,"provider"?: string,"provider_envelope_id"?: string | null,"requested_by"?: string | null,"sent_at"?: string | null,"signed_at"?: string | null,"signer_id"?: string,"status"?: Database["public"]['Enums']["signature_status"],"updated_at"?: string,"viewed_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "signature_requests_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "signature_requests_matter_id_fkey"
      columns: ["matter_id"]
isOneToOne: false
      referencedRelation: "matters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "signature_requests_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "signature_requests_signer_id_fkey"
      columns: ["signer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "client_dashboard_counts":
{ Args: Record<PropertyKey, never>; Returns: {
              "active_matters": number,"outstanding_balance": number,"pending_documents": number,"unread_messages": number
            }[]
                           },
"list_audit_events":
{ Args: { "p_before"?: string,"p_limit"?: number,"p_matter_id"?: string }; Returns: unknown[]
                          SetofOptions: {
        from: "*"
        to: "events"
        isOneToOne: false
        isSetofReturn: true
      } },
"list_matter_access":
{ Args: { "p_matter": string }; Returns: {
              "access_level": Database["public"]['Enums']["access_level"],
"granted_at": string,
"granted_by": string | null,
"id": string,
"matter_id": string,
"revoke_reason": string | null,
"revoked_at": string | null,
"revoked_by": string | null,
"user_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "matter_access"
        isOneToOne: false
        isSetofReturn: true
      } }
          }
          Enums: {
            "access_level": "read"|"read_write","app_role": "client"|"staff"|"firm_admin","appointment_status": "scheduled"|"completed"|"cancelled","conversation_scope": "matter"|"general","document_folder": "shared"|"client_upload"|"signed"|"internal","document_provider": "sharepoint"|"clio"|"supabase_storage"|"imanage","document_status": "uploaded"|"in_review"|"accepted"|"rejected"|"pending_signature"|"signed","invitation_status": "pending"|"accepted"|"expired"|"revoked","invoice_status": "due"|"overdue"|"paid"|"void","matter_status": "open"|"action_required"|"on_hold"|"closed","notification_priority": "urgent"|"info"|"success","notification_type": "document_requested"|"document_received"|"new_document"|"new_message"|"appointment_scheduled"|"appointment_reminder"|"matter_status_changed"|"matter_completed"|"invoice_issued"|"payment_received"|"signature_required"|"security_alert","org_member_role": "owner"|"member","org_type": "client_organization"|"partner","payment_status": "pending"|"processing"|"succeeded"|"failed"|"refunded"|"cancelled","request_status": "pending"|"fulfilled"|"overdue"|"cancelled","scan_status": "pending"|"clean"|"infected"|"failed"|"not_required","signature_status": "to_sign"|"sent"|"viewed"|"signed"|"declined"|"expired","team_role": "responsible"|"originating"|"collaborator"|"assistant","user_status": "invited"|"active"|"suspended"|"deactivated"
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
            "access_level": ["read", "read_write"],"app_role": ["client", "staff", "firm_admin"],"appointment_status": ["scheduled", "completed", "cancelled"],"conversation_scope": ["matter", "general"],"document_folder": ["shared", "client_upload", "signed", "internal"],"document_provider": ["sharepoint", "clio", "supabase_storage", "imanage"],"document_status": ["uploaded", "in_review", "accepted", "rejected", "pending_signature", "signed"],"invitation_status": ["pending", "accepted", "expired", "revoked"],"invoice_status": ["due", "overdue", "paid", "void"],"matter_status": ["open", "action_required", "on_hold", "closed"],"notification_priority": ["urgent", "info", "success"],"notification_type": ["document_requested", "document_received", "new_document", "new_message", "appointment_scheduled", "appointment_reminder", "matter_status_changed", "matter_completed", "invoice_issued", "payment_received", "signature_required", "security_alert"],"org_member_role": ["owner", "member"],"org_type": ["client_organization", "partner"],"payment_status": ["pending", "processing", "succeeded", "failed", "refunded", "cancelled"],"request_status": ["pending", "fulfilled", "overdue", "cancelled"],"scan_status": ["pending", "clean", "infected", "failed", "not_required"],"signature_status": ["to_sign", "sent", "viewed", "signed", "declined", "expired"],"team_role": ["responsible", "originating", "collaborator", "assistant"],"user_status": ["invited", "active", "suspended", "deactivated"]
          }
        }
} as const
