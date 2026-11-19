package cmdb

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestImportSubnets(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	// A CSV that mixes a valid row with a broken one imports nothing.
	mixed := "网段名称,CIDR,网关,VLAN,状态,用途\n办公网,192.0.2.0/24,192.0.2.1,,启用,办公\n坏网段,not-a-cidr,,,,\n"
	if _, err := ImportSubnets(ctx, db, strings.NewReader(mixed), "tester"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("bad cidr import = %v, want ErrInvalid", err)
	}
	if subnets, err := ListSubnets(ctx, db); err != nil || len(subnets) != 0 {
		t.Fatalf("partial import wrote rows: %+v, %v", subnets, err)
	}

	valid := "网段名称,CIDR,网关,状态,用途\n办公网,192.0.2.0/24,192.0.2.1,启用,办公\n存储网,198.51.100.0/24,198.51.100.1,预留,存储\n"
	imported, err := ImportSubnets(ctx, db, strings.NewReader(valid), "tester")
	if err != nil || imported != 2 {
		t.Fatalf("import subnets = %d, %v", imported, err)
	}
	subnets, err := ListSubnets(ctx, db)
	if err != nil || len(subnets) != 2 {
		t.Fatalf("list subnets = %+v, %v", subnets, err)
	}

	// Re-importing the same names is rejected, and so is the same CIDR under a
	// new name (nested children such as /25 are allowed by design).
	if _, err := ImportSubnets(ctx, db, strings.NewReader(valid), "tester"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("duplicate import = %v, want ErrInvalid", err)
	}
	duplicateCIDR := "网段名称,CIDR\n办公网副本,192.0.2.0/24\n"
	if _, err := ImportSubnets(ctx, db, strings.NewReader(duplicateCIDR), "tester"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("duplicate cidr import = %v, want ErrInvalid", err)
	}

	// A missing required column is reported before touching the database.
	if _, err := ImportSubnets(ctx, db, strings.NewReader("网段名称\n只有名称\n"), "tester"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("missing cidr column = %v, want ErrInvalid", err)
	}
}
