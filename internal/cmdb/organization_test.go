package cmdb

import (
	"context"
	"errors"
	"testing"
)

func TestOrganizationAssignments(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	if _, err := db.ExecContext(ctx, "INSERT INTO users (username,password_hash,role) VALUES ('demo-viewer','unused','viewer')"); err != nil {
		t.Fatal(err)
	}
	username := "demo-viewer"
	personID, err := SavePerson(ctx, db, 0, PersonFields{
		DirectoryFields: DirectoryFields{Name: "示例负责人"}, Username: &username,
	})
	if err != nil {
		t.Fatal(err)
	}
	teamID, err := SaveTeam(ctx, db, 0, TeamFields{
		DirectoryFields: DirectoryFields{Name: "示例运维组"}, MemberIDs: []int64{personID, personID},
	})
	if err != nil {
		t.Fatal(err)
	}
	project, err := SaveGroup(ctx, db, 0, GroupFields{Name: "示例项目"})
	if err != nil {
		t.Fatal(err)
	}
	fields := baseFields("vm", "demo-organization-vm")
	fields.Owner, fields.GroupID, fields.TeamID = "示例负责人", project.ID, teamID
	asset, err := SaveAsset(ctx, db, 0, 0, fields, "demo-operator")
	if err != nil {
		t.Fatal(err)
	}
	if asset.PersonID != personID || asset.GroupID != project.ID || asset.TeamID != teamID {
		t.Fatalf("unexpected assignments: person=%d project=%d team=%d", asset.PersonID, asset.GroupID, asset.TeamID)
	}
	_, err = SaveTeam(ctx, db, teamID, TeamFields{
		DirectoryFields: DirectoryFields{Name: "保存失败时不会重命名"}, MemberIDs: []int64{0},
	})
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected invalid member error, got %v", err)
	}
	teams, err := ListTeams(ctx, db)
	if err != nil || len(teams) != 1 || teams[0].Name != "示例运维组" ||
		teams[0].AssetCount != 1 || len(teams[0].MemberIDs) != 1 || teams[0].MemberIDs[0] != personID {
		t.Fatalf("team member or asset count changed on failed save: %+v, %v", teams, err)
	}
	if err := deleteDirectoryEntry(ctx, db, "DELETE FROM people WHERE id=$1", personID); !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected removal of assigned person to be rejected, got %v", err)
	}

	_, err = SavePerson(ctx, db, personID, PersonFields{DirectoryFields: DirectoryFields{Name: "示例新名称"}})
	if err != nil {
		t.Fatal(err)
	}
	people, err := ListPeople(ctx, db, false)
	if err != nil || len(people) != 1 || people[0].Username != nil || people[0].AssetCount != 1 {
		t.Fatalf("unexpected directory entry for non-admin: %+v, %v", people, err)
	}
	people, err = ListPeople(ctx, db, true)
	if err != nil || len(people) != 1 || people[0].Username == nil || *people[0].Username != username {
		t.Fatalf("expected linked account to be preserved: %+v, %v", people, err)
	}
	assets, err := ListAssets(ctx, db)
	if err != nil || len(assets) != 1 || assets[0].Owner != "示例新名称" {
		t.Fatalf("expected the updated person name on the asset: %+v, %v", assets, err)
	}
	if _, err = db.ExecContext(ctx, "DELETE FROM users WHERE username=$1", username); err != nil {
		t.Fatal(err)
	}
	people, err = ListPeople(ctx, db, true)
	if err != nil || len(people) != 1 || people[0].Username != nil || people[0].AssetCount != 1 {
		t.Fatalf("expected just the account link to be removed: %+v, %v", people, err)
	}
}
